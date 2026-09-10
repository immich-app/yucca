import { isoDatetimeToDate } from '@common/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const DiscordInviteClaimSchema = z
  .object({
    id: z.string(),
    discordUserId: z.string(),
    discordUsername: z.string().nullable(),
    batchId: z.string().nullable(),
    inviteUsed: z.boolean(),
    inviteUsedAt: isoDatetimeToDate.nullable(),
    createdAt: isoDatetimeToDate,
  })
  .meta({ id: 'DiscordInviteClaimDto' });

const DiscordInviteClaimListResponseSchema = z
  .object({ items: z.array(DiscordInviteClaimSchema) })
  .meta({ id: 'DiscordInviteClaimListResponseDto' });

const DiscordInviteBatchSchema = z
  .object({
    id: z.string(),
    guildId: z.string(),
    channelId: z.string(),
    messageId: z.string().nullable(),
    maxClaims: z.number(),
    claimed: z.number(),
    used: z.number(),
    createdByDiscordUserId: z.string(),
    cancelledAt: isoDatetimeToDate.nullable(),
    createdAt: isoDatetimeToDate,
  })
  .meta({ id: 'DiscordInviteBatchDto' });

const DiscordInviteBatchListResponseSchema = z
  .object({ items: z.array(DiscordInviteBatchSchema) })
  .meta({ id: 'DiscordInviteBatchListResponseDto' });

const DiscordInviteBatchCancelQuerySchema = z
  .object({
    revokeUnused: z.enum(['true', 'false']).optional().describe('Also delete the batch’s unredeemed claims'),
  })
  .meta({ id: 'DiscordInviteBatchCancelQueryDto' });

const DiscordInviteBatchCancelResponseSchema = z
  .object({
    batch: DiscordInviteBatchSchema,
    revokedClaims: z.number().describe('Unredeemed claims deleted by --revoke-unused'),
  })
  .meta({ id: 'DiscordInviteBatchCancelResponseDto' });

export class DiscordInviteClaimDto extends createZodDto(DiscordInviteClaimSchema) {}
export class DiscordInviteClaimListResponseDto extends createZodDto(DiscordInviteClaimListResponseSchema) {}
export class DiscordInviteBatchDto extends createZodDto(DiscordInviteBatchSchema) {}
export class DiscordInviteBatchListResponseDto extends createZodDto(DiscordInviteBatchListResponseSchema) {}
export class DiscordInviteBatchCancelQueryDto extends createZodDto(DiscordInviteBatchCancelQuerySchema) {}
export class DiscordInviteBatchCancelResponseDto extends createZodDto(DiscordInviteBatchCancelResponseSchema) {}
