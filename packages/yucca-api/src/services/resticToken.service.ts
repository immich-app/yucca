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

  async revoke(auth: AuthDto, jti: string): Promise<void> {
    const token = await this.resticTokens.get(jti);
    if (!token || token.userId !== auth.id) {
      throw new NotFoundException(`No restic token with jti ${jti}`);
    }

    await this.resticTokens.revoke(jti, `user:${auth.id}`);
    await this.revocation.invalidateVerdict(jti);
  }
}
