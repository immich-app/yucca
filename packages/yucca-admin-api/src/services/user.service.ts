import { ConflictException, Injectable } from '@nestjs/common';
import {
  UserGetResponseDto,
  UserListQueryDto,
  UserListResponseDto,
  UserUpdateRequestDto,
  UserUpdateResponseDto,
} from 'src/dto/user.dto';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';
import { RevocationRepository } from 'src/repositories/revocation.repository';
import { SessionRepository } from 'src/repositories/session.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { resolveLimit } from 'src/utils/pagination';

@Injectable()
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly resticTokens: ResticTokenRepository,
    private readonly revocation: RevocationRepository,
  ) {}

  list(query: UserListQueryDto): Promise<UserListResponseDto> {
    return this.users.list({ cursor: query.cursor, limit: resolveLimit(query.limit) });
  }

  async get(id: string): Promise<UserGetResponseDto> {
    return { user: await this.users.get(id) };
  }

  async update(id: string, dto: UserUpdateRequestDto): Promise<UserUpdateResponseDto> {
    if (dto.disabled === true) {
      await this.sessions.deleteByUser(id);
    }
    await this.users.update(id, dto);
    if (dto.disabled === true) {
      const active = await this.resticTokens.getActiveByUser(id);
      for (const token of active) {
        await this.revocation.invalidateVerdict(token.jti);
      }
    }
    return { user: await this.users.get(id) };
  }

  async delete(id: string): Promise<void> {
    if (await this.users.hasRepositories(id)) {
      throw new ConflictException('Cannot delete a user that still owns repositories');
    }
    await this.users.delete(id);
  }
}
