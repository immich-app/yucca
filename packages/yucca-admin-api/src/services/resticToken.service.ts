import { LoggerRepository } from '@common/server/otel';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthDto } from 'src/dto/auth.dto';
import { ResticTokenListQueryDto, ResticTokenListResponseDto } from 'src/dto/resticToken.dto';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';
import { RevocationRepository } from 'src/repositories/revocation.repository';
import { resolveLimit } from 'src/utils/pagination';

@Injectable()
export class ResticTokenService {
  constructor(
    private readonly logger: LoggerRepository,
    private readonly resticTokens: ResticTokenRepository,
    private readonly revocation: RevocationRepository,
  ) {}

  list(query: ResticTokenListQueryDto): Promise<ResticTokenListResponseDto> {
    return this.resticTokens.list({
      cursor: query.cursor,
      limit: resolveLimit(query.limit),
      userId: query.userId,
      repositoryId: query.repositoryId,
      active: query.active === undefined ? undefined : query.active === 'true',
    });
  }

  // DB first, then Redis: a Redis failure surfaces (the admin must know the
  // revoke has not propagated to michael yet). The metrics-worker reconcile
  // sweeps stale markers for revoked tokens, so a failed DEL heals within a tick.
  async revoke(auth: AuthDto, jti: string): Promise<void> {
    const existing = await this.resticTokens.get(jti);
    if (!existing) {
      throw new NotFoundException(`No restic token with jti ${jti}`);
    }

    const revoked = await this.resticTokens.revoke(jti, auth.sub);
    if (!revoked) {
      // Already revoked — idempotent, but still make sure Redis agrees.
      await this.revocation.markInvalid(jti);
      return;
    }

    this.logger.info(`Revoked restic token ${jti} (minted ${existing.mintedBy}, by ${auth.sub})`);
    await this.revocation.markInvalid(jti);
  }
}
