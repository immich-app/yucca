import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  UserDiscordLinkDto,
  UserDiscordLinkRequestDto,
  UserGetResponseDto,
  UserListQueryDto,
  UserListResponseDto,
  UserUpdateRequestDto,
  UserUpdateResponseDto,
} from 'src/dto/user.dto';
import { DiscordLinkRepository } from 'src/repositories/discordLink.repository';
import { SessionRepository } from 'src/repositories/session.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { resolveLimit } from 'src/utils/pagination';

@Injectable()
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly discordLinks: DiscordLinkRepository,
  ) {}

  list(query: UserListQueryDto): Promise<UserListResponseDto> {
    return this.users.list({ cursor: query.cursor, limit: resolveLimit(query.limit) });
  }

  async get(id: string): Promise<UserGetResponseDto> {
    const [user, link] = await Promise.all([this.users.get(id), this.discordLinks.getByUserId(id)]);
    return { user, discordLink: link ? toDiscordLinkDto(link) : null };
  }

  async linkDiscord(id: string, dto: UserDiscordLinkRequestDto): Promise<UserDiscordLinkDto> {
    await this.users.get(id);
    const link = await this.discordLinks.link(id, dto.discordUserId, dto.discordUsername ?? '');
    return toDiscordLinkDto(link);
  }

  async unlinkDiscord(id: string): Promise<void> {
    if (!(await this.discordLinks.unlink(id))) {
      throw new NotFoundException(`No discord link for user ${id}`);
    }
  }

  async update(id: string, dto: UserUpdateRequestDto): Promise<UserUpdateResponseDto> {
    if (dto.disabled === true) {
      await this.sessions.deleteByUser(id);
    }
    await this.users.update(id, dto);
    return { user: await this.users.get(id) };
  }

  async delete(id: string): Promise<void> {
    if (await this.users.hasRepositories(id)) {
      throw new ConflictException('Cannot delete a user that still owns repositories');
    }
    await this.users.delete(id);
  }
}

const toDiscordLinkDto = (link: {
  discordUserId: string;
  discordUsername: string;
  createdAt: Date;
}): UserDiscordLinkDto => ({
  discordUserId: link.discordUserId,
  discordUsername: link.discordUsername,
  createdAt: link.createdAt,
});
