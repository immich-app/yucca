import { isConsumerType, resolveFeatures } from '@common/server';
import { LoggerRepository, WideContextRepository } from '@common/server/otel';
import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { parse } from 'cookie';
import EventIterator from 'event-iterator';
import { Request } from 'express';
import { IncomingHttpHeaders } from 'node:http';
import { UserInfoResponse } from 'openid-client';
import { from } from 'rxjs';
import { AuthDto } from 'src/dto/auth.dto';
import { CookieName } from 'src/enum';
import { env } from 'src/env';
import { ConsumerRepository } from 'src/repositories/consumer.repository';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { FeatureFlagRepository } from 'src/repositories/featureFlag.repository';
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
    private readonly consumer: ConsumerRepository,
    private readonly featureFlag: FeatureFlagRepository,
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

    const { consumerLastSeenAt, ...user } = row;

    // Consumer liveness, throttled to one write per 5 minutes.
    if (user.consumerId && (!consumerLastSeenAt || Date.now() - consumerLastSeenAt.getTime() > 300_000)) {
      await this.consumer.touchLastSeen(user.consumerId);
    }

    const overrides = await this.featureFlag.getByUser(user.id);

    return { ...user, features: resolveFeatures(overrides) };
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

      // Invariant: every user has a default (immich) consumer from day one.
      await this.consumer.getOrCreateDefault(user.id);
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

  // Resolves which consumer instance a device-flow session binds to. Absent
  // type = legacy client → the default consumer. With the multi-consumer flag
  // off only immich is allowed (still the default consumer — no instances
  // without the flag); with it on, (type, name) names a reusable instance.
  private async resolveDeviceConsumer(
    userId: string,
    features: Record<string, boolean>,
    consumerType?: string,
    consumerName?: string,
  ): Promise<string> {
    if (consumerType && !isConsumerType(consumerType)) {
      throw new BadRequestException(`Unknown consumer type '${consumerType}'`);
    }

    if (!features['multi-consumer']) {
      if (consumerType && consumerType !== 'immich') {
        throw new FeatureNotEnabledException('multi-consumer');
      }
      const consumer = await this.consumer.getOrCreateDefault(userId);
      return consumer.id;
    }

    const type = consumerType ?? 'immich';
    if (!consumerType) {
      const consumer = await this.consumer.getOrCreateDefault(userId);
      return consumer.id;
    }

    const name = consumerName?.trim() || type;
    const existing = await this.consumer.getByUserTypeName(userId, type, name);
    const consumer = existing ?? (await this.consumer.create({ userId, type, name }));
    return consumer.id;
  }

  async oidcDeviceFlow(
    callback: (data: { userCode: string; verificationUri: string }) => void,
    consumerType?: string,
    consumerName?: string,
  ): Promise<{ accessToken: string }> {
    const { userCode, verificationUri, claims: pendingClaims } = await this.oidc.deviceFlow();

    callback({ userCode, verificationUri });

    const claims = await pendingClaims;

    if (!claims) {
      throw new InternalServerErrorException('no id token received');
    }

    this.wideContext.assignContext({ claims });

    const user = await this.getOrCreateUser(claims);

    this.wideContext.addContext('customerId', user.id);

    const overrides = await this.featureFlag.getByUser(user.id);
    const consumerId = await this.resolveDeviceConsumer(
      user.id,
      resolveFeatures(overrides),
      consumerType,
      consumerName,
    );
    await this.consumer.touchLastSeen(consumerId);

    const accessToken = this.crypto.randomHex(32);

    await this.session.create({
      userId: user.id,
      accessToken,
      consumerId,
      kind: 'device',
    });

    return {
      accessToken,
    };
  }

  oidcDeviceFlowObservable(consumerType?: string, consumerName?: string) {
    return from(
      new EventIterator<MessageEvent>(
        (queue) =>
          void this.oidcDeviceFlow(
            (data) =>
              queue.push({
                data: {
                  type: 'START',
                  ...data,
                },
              } as MessageEvent),
            consumerType,
            consumerName,
          )
            .then(({ accessToken }) => queue.push({ data: { type: 'SUCCESS', accessToken } } as MessageEvent))
            .catch((error) => {
              this.wideContext.setErrorCause(error);
              this.logger.error('oidcDeviceFlow error:', error);
              let reason = 'UNKNOWN';
              if (error instanceof EmailNotAllowedException) {
                reason = 'EMAIL_NOT_ALLOWED';
              } else if (error instanceof FeatureNotEnabledException) {
                reason = 'FEATURE_NOT_ENABLED';
              }
              queue.push({ data: { type: 'FAILURE', reason } } as MessageEvent);
            })
            .finally(() => queue.stop()),
      ),
    );
  }
}
