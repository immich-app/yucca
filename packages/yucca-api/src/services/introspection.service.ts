import { Injectable, NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from 'src/env';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Constant-time equality over unequal-length strings: compare sha256 digests.
const secretsMatch = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

// Token introspection for michael: "is this jti currently good?" — the DB is
// the source of truth: the token row must be unrevoked and unexpired AND its
// owner enabled (a disabled account's credentials die with it). michael caches
// the verdict (fresh TTL, bounded grace). Unknown, malformed, revoked, expired,
// and disabled-owner jtis all answer active:false — indistinguishably.
@Injectable()
export class IntrospectionService {
  constructor(private readonly resticTokens: ResticTokenRepository) {}

  async introspect(secret: string | undefined, jti: string): Promise<{ active: boolean }> {
    if (!env.TOKEN_INTROSPECTION_SECRET) {
      throw new NotImplementedException('TOKEN_INTROSPECTION_SECRET is not configured');
    }
    if (!secret || !secretsMatch(secret, env.TOKEN_INTROSPECTION_SECRET)) {
      throw new UnauthorizedException();
    }

    // Non-UUID input can't be a minted jti (and would fail the uuid cast in PG).
    if (!UUID_RE.test(jti)) {
      return { active: false };
    }

    const token = await this.resticTokens.getWithOwner(jti);
    const active =
      !!token && token.revokedAt === null && token.expiresAt.getTime() > Date.now() && !token.ownerDisabled;
    return { active };
  }
}
