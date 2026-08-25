import { connectionTypeFlag, isConnectionType, resolveFeatures } from '@common/server';
import { LoggerRepository, WideContextRepository } from '@common/server/otel';
import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { parse } from 'cookie';
import EventIterator from 'event-iterator';
import { Request } from 'express';
import { IncomingHttpHeaders } from 'node:http';
import { UserInfoResponse } from 'openid-client';
import { from } from 'rxjs';
import { AuthDto } from 'src/dto/auth.dto';
import { CookieName, DeviceFlowEventType, DeviceFlowFailureReason } from 'src/enum';
import { env } from 'src/env';
import { ConnectionRepository } from 'src/repositories/connection.repository';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { OidcRepository } from 'src/repositories/oidc.repository';
import { SessionRepository } from 'src/repositories/session.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { UserAllowlistRepository } from 'src/repositories/userAllowlist.repository';
import { EmailNotAllowedException, FeatureNotEnabledException } from 'src/utils/exceptions';

@Injectable()
export class AuthService {
  constructor(
    private readonly logger: LoggerRepository,
    private readonly oidc: OidcRepository,
    private readonly user: UserRepository,
    private readonly allowlist: UserAllowlistRepository,
    private readonly crypto: CryptoRepository,
    private readonly session: SessionRepository,
    private readonly wideContext: WideContextRepository,
    private readonly connection: ConnectionRepository,
  ) {}

  async authenticate(headers: IncomingHttpHeaders): Promise<AuthDto> {
    const cookies = parse(headers.cookie ?? '');
    const accessToken = cookies[CookieName.AccessToken];

    if (!accessToken) {
      throw new UnauthorizedException(`Missing ${CookieName.AccessToken} cookie`);
    }

    const row = await this.user.getByAccessToken(accessToken);
    if (!row) {
      throw new UnauthorizedException(`Invalid access token`);
    }

    this.wideContext.addContext('customerId', row.id);

    const { connectionLastSeenAt, featureOverrides, ...user } = row;

    if (user.connectionId && (!connectionLastSeenAt || Date.now() - connectionLastSeenAt.getTime() > 300_000)) {
      await this.connection.touchLastSeen(user.connectionId);
    }

    return { ...user, features: resolveFeatures(featureOverrides) };
  }

  async logout(auth: AuthDto): Promise<URL | void> {
    const url = this.oidc.logout();
    await this.session.delete(auth.sessionId);
    return url;
  }

  async oidcAuthorize(
    codeChallenge?: string,
    state?: string,
  ): Promise<{ redirectTo: string; state: string; codeVerifier?: string }> {
    const { redirectTo, state: newState, codeVerifier } = await this.oidc.authorize(codeChallenge, state);
    return { redirectTo: redirectTo.href, state: newState, codeVerifier };
  }

  async oidcCallback(request: Request): Promise<{ redirectTo: string; accessToken: string }> {
    const redirectUri = new URL(env.OIDC_REDIRECT_URI);
    const url = new URL(`${redirectUri.origin}${request.originalUrl}`);

    const error = url.searchParams.has('error');

    if (error) {
      throw new InternalServerErrorException(`OIDC error: ${url.searchParams.get('error_description') ?? error}`);
    }

    const cookies = parse(request.headers.cookie || '');
    const {
      [CookieName.OidcState]: expectedState,
      [CookieName.OidcCodeVerifier]: codeVerifier,
      [CookieName.InviteCode]: inviteCode,
    } = cookies;

    if (!expectedState) {
      throw new InternalServerErrorException('missing expectedState');
    }

    if (!codeVerifier) {
      throw new InternalServerErrorException('missing codeVerifier');
    }

    const claims = await this.oidc.callback(url, expectedState, codeVerifier);

    if (!claims) {
      throw new InternalServerErrorException('no id token received');
    }

    this.wideContext.assignContext({ claims });

    const user = await this.getOrCreateUser(claims, inviteCode);

    this.wideContext.addContext('customerId', user.id);

    const accessToken = this.crypto.randomHex(32);

    await this.session.create({
      userId: user.id,
      accessToken,
      kind: 'web',
    });

    return {
      redirectTo: '/',
      accessToken,
    };
  }

  async getOrCreateUser(claims: Pick<UserInfoResponse, 'sub' | 'name' | 'email'>, inviteCode?: string) {
    if (typeof claims.name !== 'string') {
      throw new InternalServerErrorException('name is missing from claims');
    }

    if (typeof claims.email !== 'string') {
      throw new InternalServerErrorException('email is missing from claims');
    }

    let user = await this.user.getBySub(claims.sub);

    if (user) {
      if (user.disabled) {
        throw new UnauthorizedException('Account is disabled');
      }

      await this.user.update(user.id, {
        name: claims.name,
        email: claims.email,
      });
    } else {
      await this.assertEmailAllowed(claims.email.toLowerCase(), inviteCode);

      user = await this.user.create({
        sub: claims.sub,
        name: claims.name,
        email: claims.email,
      });

      await this.connection.getOrCreateDefault(user.id);
    }

    return user;
  }

  private async assertEmailAllowed(email: string, inviteCode?: string) {
    const domain = email.split('@').pop() ?? '';
    if (env.ALLOWED_EMAIL_DOMAINS.includes(domain)) {
      return;
    }

    const entry = await this.allowlist.getByEmail(email);
    if (entry?.invited) {
      if (!entry.inviteUsed) {
        await this.allowlist.markUsed(entry.id);
      }
      return;
    }

    if (inviteCode) {
      const codeEntry = await this.allowlist.getByInviteCode(inviteCode.trim().toUpperCase());
      if (codeEntry && !codeEntry.inviteUsed) {
        await this.allowlist.markUsed(codeEntry.id);
        return;
      }
    }

    throw new EmailNotAllowedException();
  }

  private async resolveDeviceConnection(
    userId: string,
    features: Record<string, boolean>,
    connectionType?: string,
    connectionName?: string,
  ): Promise<string> {
    if (!connectionType) {
      const connection = await this.connection.getOrCreateDefault(userId);
      return connection.id;
    }

    if (!isConnectionType(connectionType)) {
      throw new BadRequestException(`Unknown connection type '${connectionType}'`);
    }

    const flag = connectionTypeFlag(connectionType);
    if (flag && !features[flag]) {
      throw new FeatureNotEnabledException(flag);
    }

    const name = connectionName?.trim() || connectionType;
    const existing = await this.connection.getByUserTypeName(userId, connectionType, name);
    const connection = existing ?? (await this.connection.create({ userId, type: connectionType, name }));
    return connection.id;
  }

  private async runDeviceFlow(callback: (data: { userCode: string; verificationUri: string }) => void) {
    const { userCode, verificationUri, claims: pendingClaims } = await this.oidc.deviceFlow();

    callback({ userCode, verificationUri });

    const claims = await pendingClaims;

    if (!claims) {
      throw new InternalServerErrorException('no id token received');
    }

    this.wideContext.assignContext({ claims });

    const user = await this.getOrCreateUser(claims);

    this.wideContext.addContext('customerId', user.id);

    return user;
  }

  async oidcDeviceFlowIdentity(
    callback: (data: { userCode: string; verificationUri: string }) => void,
  ): Promise<{ userId: string }> {
    const user = await this.runDeviceFlow(callback);

    return { userId: user.id };
  }

  async oidcDeviceFlow(
    callback: (data: { userCode: string; verificationUri: string }) => void,
    connectionType?: string,
    connectionName?: string,
  ): Promise<{ accessToken: string }> {
    const user = await this.runDeviceFlow(callback);

    const overrides = await this.user.getFeatureOverrides(user.id);
    const connectionId = await this.resolveDeviceConnection(
      user.id,
      resolveFeatures(overrides),
      connectionType,
      connectionName,
    );
    await this.connection.touchLastSeen(connectionId);

    const accessToken = this.crypto.randomHex(32);

    await this.session.create({
      userId: user.id,
      accessToken,
      connectionId,
      kind: 'device',
    });

    return {
      accessToken,
    };
  }

  oidcDeviceFlowIdentityObservable() {
    return from(
      new EventIterator<MessageEvent>(
        (queue) =>
          void this.oidcDeviceFlowIdentity((data) =>
            queue.push({ data: { type: DeviceFlowEventType.Start, ...data } } as MessageEvent),
          )
            .then(({ userId }) => queue.push({ data: { type: DeviceFlowEventType.Success, userId } } as MessageEvent))
            .catch((error) => this.pushDeviceFlowFailure(queue, error))
            .finally(() => queue.stop()),
      ),
    );
  }

  oidcDeviceFlowObservable(connectionType?: string, connectionName?: string) {
    return from(
      new EventIterator<MessageEvent>(
        (queue) =>
          void this.oidcDeviceFlow(
            (data) =>
              queue.push({
                data: {
                  type: DeviceFlowEventType.Start,
                  ...data,
                },
              } as MessageEvent),
            connectionType,
            connectionName,
          )
            .then(({ accessToken }) =>
              queue.push({ data: { type: DeviceFlowEventType.Success, accessToken } } as MessageEvent),
            )
            .catch((error) => this.pushDeviceFlowFailure(queue, error))
            .finally(() => queue.stop()),
      ),
    );
  }

  private pushDeviceFlowFailure(queue: { push: (value: MessageEvent) => void }, error: unknown) {
    this.wideContext.setErrorCause(error);
    this.logger.error('oidcDeviceFlow error:', error);

    let reason = DeviceFlowFailureReason.Unknown;
    if (error instanceof EmailNotAllowedException) {
      reason = DeviceFlowFailureReason.EmailNotAllowed;
    } else if (error instanceof FeatureNotEnabledException) {
      reason = DeviceFlowFailureReason.FeatureNotEnabled;
    }

    queue.push({ data: { type: DeviceFlowEventType.Failure, reason } } as MessageEvent);
  }
}
