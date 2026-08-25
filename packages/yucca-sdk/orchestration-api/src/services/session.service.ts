import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { parse as parseCookies } from 'cookie';
import { REPOSITORY_DEFAULT_CLOUD_UUID, SESSION_TTL_MS } from '../const';
import { BackendType, CookieName } from '../enum';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';

export type Session = {
  userId: string;
};

@Injectable()
export class SessionService {
  constructor(
    private readonly config: ConfigRepository,
    private readonly moduleConfig: ModuleConfigRepository,
    private readonly backend: BackendRepository,
    private readonly jwt: JwtService,
  ) {}

  async claimedUserId(): Promise<string | undefined> {
    const cloud = await this.backend.getBackend(REPOSITORY_DEFAULT_CLOUD_UUID);

    return cloud?.configuration.type === BackendType.Yucca ? cloud.configuration.userId : undefined;
  }

  async isRequired(): Promise<boolean> {
    if (!this.moduleConfig.get().requireSession) {
      return false;
    }

    const claimedUserId = await this.claimedUserId();

    return claimedUserId !== undefined;
  }

  async issue(userId: string): Promise<string> {
    return this.jwt.signAsync(
      {},
      {
        secret: await this.signingKey(),
        subject: userId,
        expiresIn: SESSION_TTL_MS / 1000,
      },
    );
  }

  async verify(token: string | undefined): Promise<Session | undefined> {
    if (!token) {
      return;
    }

    try {
      const { sub } = await this.jwt.verifyAsync<{ sub: string }>(token, { secret: await this.signingKey() });

      return { userId: sub };
    } catch {
      return;
    }
  }

  async authenticate(token: string): Promise<Session> {
    const session = await this.verify(token);
    if (!session) {
      throw new UnauthorizedException('Session token is invalid or expired');
    }

    return session;
  }

  async fromCookieHeader(header: string | undefined): Promise<Session | undefined> {
    if (!header) {
      return;
    }

    return this.verify(parseCookies(header)[CookieName.SessionToken]);
  }

  private async signingKey(): Promise<Buffer> {
    return this.config.getSessionSecret();
  }
}
