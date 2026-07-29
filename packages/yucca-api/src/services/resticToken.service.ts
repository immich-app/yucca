import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthDto } from 'src/dto/auth.dto';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';
import { RevocationRepository } from 'src/repositories/revocation.repository';

@Injectable()
export class ResticTokenService {
  constructor(
    private readonly resticTokens: ResticTokenRepository,
    private readonly revocation: RevocationRepository,
  ) {}

  // Owner-scoped revoke: a user can only revoke their own tokens. Unknown or
  // other-owner jtis 404 identically, so ownership isn't leaked. The DB is the
  // source of truth; invalidating michael's shared verdict cache makes the
  // revoke land within its fresh-cache TTL. Idempotent.
  async revoke(auth: AuthDto, jti: string): Promise<void> {
    const token = await this.resticTokens.get(jti);
    if (!token || token.userId !== auth.id) {
      throw new NotFoundException(`No restic token with jti ${jti}`);
    }

    await this.resticTokens.revoke(jti, `user:${auth.id}`);
    await this.revocation.invalidateVerdict(jti);
  }
}
