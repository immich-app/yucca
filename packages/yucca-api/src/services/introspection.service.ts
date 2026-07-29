import { Injectable, NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { env } from 'src/env';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class IntrospectionService {
  constructor(
    private readonly resticTokens: ResticTokenRepository,
    private readonly crypto: CryptoRepository,
  ) {}

  async introspect(secret: string | undefined, jti: string): Promise<{ active: boolean }> {
    if (!env.TOKEN_INTROSPECTION_SECRET) {
      throw new NotImplementedException('TOKEN_INTROSPECTION_SECRET is not configured');
    }
    if (!secret || !this.crypto.secretsMatch(secret, env.TOKEN_INTROSPECTION_SECRET)) {
      throw new UnauthorizedException();
    }

    if (!UUID_RE.test(jti)) {
      return { active: false };
    }

    const token = await this.resticTokens.getWithOwner(jti);
    const active =
      !!token && token.revokedAt === null && token.expiresAt.getTime() > Date.now() && !token.ownerDisabled;
    return { active };
  }
}
