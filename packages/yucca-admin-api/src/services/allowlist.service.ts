import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AllowlistAddRequestDto,
  AllowlistEntriesResponseDto,
  AllowlistEntryDto,
  AllowlistEntryResponseDto,
  AllowlistInviteBatchRequestDto,
  AllowlistInviteRequestDto,
  AllowlistListQueryDto,
  AllowlistListResponseDto,
} from 'src/dto/allowlist.dto';
import { UserAllowlistRepository } from 'src/repositories/userAllowlist.repository';
import { generateInviteCode } from 'src/utils/invite-code';
import { resolveLimit } from 'src/utils/pagination';

@Injectable()
export class AllowlistService {
  constructor(private readonly allowlist: UserAllowlistRepository) {}

  list(query: AllowlistListQueryDto): Promise<AllowlistListResponseDto> {
    return this.allowlist.list({ cursor: query.cursor, limit: resolveLimit(query.limit) });
  }

  async add(dto: AllowlistAddRequestDto): Promise<AllowlistEntryResponseDto> {
    const email = dto.email.toLowerCase();

    if (await this.allowlist.getByEmail(email)) {
      throw new ConflictException('Email is already on the allowlist');
    }

    return { entry: await this.createEntry(email, !dto.staged) };
  }

  async remove(email: string): Promise<void> {
    const deleted = await this.allowlist.deleteByEmail(email.toLowerCase());
    if (!deleted) {
      throw new NotFoundException('Email is not on the allowlist');
    }
  }

  async invite(dto: AllowlistInviteRequestDto): Promise<AllowlistEntriesResponseDto> {
    const items: AllowlistEntryDto[] = [];

    for (const rawEmail of dto.emails) {
      const email = rawEmail.toLowerCase();
      const existing = await this.allowlist.getByEmail(email);

      if (!existing) {
        items.push(await this.createEntry(email, true));
      } else if (existing.invited) {
        items.push(existing);
      } else {
        items.push(await this.allowlist.update(existing.id, { invited: true }));
      }
    }

    return { items };
  }

  async inviteBatch(dto: AllowlistInviteBatchRequestDto): Promise<AllowlistEntriesResponseDto> {
    const staged = await this.allowlist.oldestStaged(dto.count);

    const items: AllowlistEntryDto[] = [];
    for (const entry of staged) {
      items.push(await this.allowlist.update(entry.id, { invited: true }));
    }

    return { items };
  }

  private async createEntry(email: string, invited: boolean) {
    try {
      return await this.allowlist.create({ email, inviteCode: generateInviteCode(), invited });
    } catch (error) {
      // A generated code colliding with an existing one is astronomically
      // unlikely (~50 bits) — retry once, then let the error propagate.
      if (isUniqueViolation(error)) {
        return await this.allowlist.create({ email, inviteCode: generateInviteCode(), invited });
      }
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505'
  );
}
