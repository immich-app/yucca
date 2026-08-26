import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { parse as parseCookies } from 'cookie';
import { REPOSITORY_DEFAULT_CLOUD_UUID, SESSION_TTL_MS } from '../const';
import { BackendType, CookieName } from '../enum';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';
import { BackendConfiguration } from '../schema/tables/backend.table';

export type CloudConfiguration = BackendConfiguration & { type: BackendType.Yucca };

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

  async cloudConfiguration(): Promise<CloudConfiguration | undefined> {
    const cloud = await this.backend.getBackend(REPOSITORY_DEFAULT_CLOUD_UUID);

    return cloud?.configuration.type === BackendType.Yucca ? cloud.configuration : undefined;
  }

  isRequired(configuration: CloudConfiguration | undefined): boolean {
    if (!this.moduleConfig.get().requireSession) {
      return false;
    }

    return configuration !== undefined;
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

  async verify(token: string | undefined, configuration: CloudConfiguration | undefined): Promise<Session | undefined> {
    const claimedUserId = configuration?.userId;
    if (!token || !claimedUserId) {
      return;
    }

    try {
      await this.jwt.verifyAsync(token, { secret: await this.signingKey(), subject: claimedUserId });
    } catch {
      return;
    }

    return { userId: claimedUserId };
  }

  async authenticate(token: string): Promise<Session> {
    const configuration = await this.cloudConfiguration();
    const session = await this.verify(token, configuration);

    if (!session) {
      throw new UnauthorizedException('Session token is invalid or expired');
    }

    return session;
  }

  async fromCookieHeader(
    header: string | undefined,
    configuration: CloudConfiguration | undefined,
  ): Promise<Session | undefined> {
    if (!header) {
      return;
    }

    return this.verify(parseCookies(header)[CookieName.SessionToken], configuration);
  }

  private async signingKey(): Promise<Buffer> {
    return this.config.getSessionSecret();
  }
}
