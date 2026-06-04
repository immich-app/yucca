import { LoggerRepository, WideContextRepository } from '@common/server/otel';
import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { parse } from 'cookie';
import EventIterator from 'event-iterator';
import { Request } from 'express';
import { IncomingHttpHeaders } from 'node:http';
import { UserInfoResponse } from 'openid-client';
import { from } from 'rxjs';
import { AuthDto } from 'src/dto/auth.dto';
import { CookieName } from 'src/enum';
import { env } from 'src/env';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { OidcRepository } from 'src/repositories/oidc.repository';
import { PolarRepository } from 'src/repositories/polar.repository';
import { SessionRepository } from 'src/repositories/session.repository';
import { UserRepository } from 'src/repositories/user.repository';

@Injectable()
export class AuthService {
  constructor(
    private readonly logger: LoggerRepository,
    private readonly oidc: OidcRepository,
    private readonly user: UserRepository,
    private readonly crypto: CryptoRepository,
    private readonly session: SessionRepository,
    private readonly polar: PolarRepository,
    private readonly wideContext: WideContextRepository,
  ) {}

  async authenticate(headers: IncomingHttpHeaders): Promise<AuthDto> {
    const cookies = parse(headers.cookie ?? '');
    const accessToken = cookies[CookieName.AccessToken];

    if (!accessToken) {
      throw new UnauthorizedException(`Missing ${CookieName.AccessToken} cookie`);
    }

    const user = await this.user.getByAccessToken(accessToken);
    if (!user) {
      throw new UnauthorizedException(`Invalid access token`);
    }

    this.wideContext.addContext('customerId', user.id);

    return user;
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
    const { [CookieName.OidcState]: expectedState, [CookieName.OidcCodeVerifier]: codeVerifier } = cookies;

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

    const user = await this.getOrCreateUser(claims);

    this.wideContext.addContext('customerId', user.id);

    const accessToken = this.crypto.randomHex(32);

    await this.session.create({
      userId: user.id,
      accessToken,
    });

    return {
      redirectTo: '/',
      accessToken,
    };
  }

  async getOrCreateUser(claims: Pick<UserInfoResponse, 'sub' | 'name' | 'email'>) {
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
      user = await this.user.create({
        sub: claims.sub,
        name: claims.name,
        email: claims.email,
      });
    }

    if (!user.polarUserId) {
      const customer = await this.polar.createOrFindCustomer(claims.sub, claims.email);
      user.polarUserId = customer.id;

      await this.user.update(user.id, {
        polarUserId: customer.id,
      });
    }

    if (!user.polarSubscriptionId) {
      const subscription = await this.polar.findActiveSubscription(user.polarUserId!);
      if (subscription) {
        user.polarSubscriptionId = subscription.id;

        await this.user.update(user.id, {
          polarSubscriptionId: subscription.id,
        });
      }
    }

    return user;
  }

  async oidcDeviceFlow(
    callback: (data: { userCode: string; verificationUri: string }) => void,
  ): Promise<{ accessToken: string }> {
    const { userCode, verificationUri, tokens } = await this.oidc.deviceFlow();

    callback({ userCode, verificationUri });

    const token = await tokens;
    const claims = token.claims();

    if (!claims) {
      throw new InternalServerErrorException('no id token received');
    }

    this.wideContext.assignContext({ claims });

    const user = await this.getOrCreateUser(claims);

    this.wideContext.addContext('customerId', user.id);

    const accessToken = this.crypto.randomHex(32);

    await this.session.create({
      userId: user.id,
      accessToken,
    });

    return {
      accessToken,
    };
  }

  oidcDeviceFlowObservable() {
    return from(
      new EventIterator<MessageEvent>(
        (queue) =>
          void this.oidcDeviceFlow((data) =>
            queue.push({
              data: {
                type: 'START',
                ...data,
              },
            } as MessageEvent),
          )
            .then(({ accessToken }) => queue.push({ data: { type: 'SUCCESS', accessToken } } as MessageEvent))
            .catch((error) => {
              this.wideContext.setErrorCause(error);
              this.logger.error('oidcDeviceFlow error:', error);
              queue.push({ data: { type: 'FAILURE' } } as MessageEvent);
            })
            .finally(() => queue.stop()),
      ),
    );
  }
}
