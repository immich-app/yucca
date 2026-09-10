import { isoDatetimeToDate } from '@common/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const DiscordLinkRequestResponseSchema = z
  .object({ discordUsername: z.string() })
  .meta({ id: 'DiscordLinkRequestResponseDto' });

const DiscordLinkRequestCreateSchema = z
  .object({
    discordUserId: z.string().max(64),
    discordUsername: z.string().max(120),
  })
  .meta({ id: 'DiscordLinkRequestCreateDto' });

const DiscordLinkUsernameUpdateSchema = z
  .object({ discordUsername: z.string().max(120) })
  .meta({ id: 'DiscordLinkUsernameUpdateDto' });

const DiscordLinkRequestCreatedSchema = z
  .object({
    code: z.string(),
    expiresAt: isoDatetimeToDate,
  })
  .meta({ id: 'DiscordLinkRequestCreatedDto' });

const DiscordLinkSchema = z
  .object({
    userId: z.string(),
    discordUserId: z.string(),
    discordUsername: z.string(),
    createdAt: isoDatetimeToDate,
  })
  .meta({ id: 'DiscordLinkDto' });

const DiscordInviteBatchCreateSchema = z
  .object({
    guildId: z.string().max(64),
    channelId: z.string().max(64),
    maxClaims: z.int().min(1).max(500),
    createdByDiscordUserId: z.string().max(64),
  })
  .meta({ id: 'DiscordInviteBatchCreateDto' });

const DiscordInviteBatchMessageSchema = z
  .object({ messageId: z.string().max(64) })
  .meta({ id: 'DiscordInviteBatchMessageDto' });

const DiscordInviteBatchSchema = z
  .object({
    id: z.string(),
    maxClaims: z.number(),
    claimed: z.number(),
  })
  .meta({ id: 'DiscordInviteBatchDto' });

const DiscordInviteCreateSchema = z
  .object({
    discordUserId: z.string().max(64),
    discordUsername: z.string().max(120),
    batchId: z.uuid().optional(),
  })
  .meta({ id: 'DiscordInviteCreateDto' });

const DiscordInviteCreatedSchema = z
  .object({
    code: z.string(),
    expiresAt: isoDatetimeToDate,
    remaining: z.number().nullable(),
  })
  .meta({ id: 'DiscordInviteCreatedDto' });

const DiscordInviteResponseSchema = z.object({ discordUsername: z.string() }).meta({ id: 'DiscordInviteResponseDto' });

const DiscordTicketCreateSchema = z
  .object({
    threadId: z.string().max(64),
    staffThreadId: z.string().max(64).optional(),
    freshdeskTicketId: z.string().max(64),
    discordUserId: z.string().max(64),
    userId: z.uuid().optional(),
    lastMirroredMessageId: z.string().max(64).optional(),
    lastStaffMirroredMessageId: z.string().max(64).optional(),
  })
  .meta({ id: 'DiscordTicketCreateDto' });

const DiscordTicketUpdateSchema = z
  .object({
    emailSubscribed: z.boolean().optional(),
    lastMirroredMessageId: z.string().max(64).optional(),
    lastStaffMirroredMessageId: z.string().max(64).optional(),
    lastFreshdeskConversationId: z.string().max(64).optional(),
    closed: z.boolean().optional(),
  })
  .meta({ id: 'DiscordTicketUpdateDto' });

const DiscordTicketSchema = z
  .object({
    id: z.string(),
    threadId: z.string(),
    staffThreadId: z.string().nullable(),
    freshdeskTicketId: z.string(),
    discordUserId: z.string(),
    userId: z.string().nullable(),
    emailSubscribed: z.boolean(),
    lastMirroredMessageId: z.string().nullable(),
    lastStaffMirroredMessageId: z.string().nullable(),
    lastFreshdeskConversationId: z.string().nullable(),
    closedAt: isoDatetimeToDate.nullable(),
    createdAt: isoDatetimeToDate,
  })
  .meta({ id: 'DiscordTicketDto' });

const DiscordTicketListSchema = z.object({ items: z.array(DiscordTicketSchema) }).meta({ id: 'DiscordTicketListDto' });

const DiscordUserSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    createdAt: isoDatetimeToDate,
    connectionCount: z.number(),
    repositoryCount: z.number(),
    lastSeenAt: isoDatetimeToDate.nullable(),
  })
  .meta({ id: 'DiscordUserSummaryDto' });

export class DiscordLinkRequestResponseDto extends createZodDto(DiscordLinkRequestResponseSchema) {}
export class DiscordLinkRequestCreateDto extends createZodDto(DiscordLinkRequestCreateSchema) {}
export class DiscordLinkUsernameUpdateDto extends createZodDto(DiscordLinkUsernameUpdateSchema) {}
export class DiscordLinkRequestCreatedDto extends createZodDto(DiscordLinkRequestCreatedSchema) {}
export class DiscordLinkDto extends createZodDto(DiscordLinkSchema) {}
export class DiscordInviteBatchCreateDto extends createZodDto(DiscordInviteBatchCreateSchema) {}
export class DiscordInviteBatchMessageDto extends createZodDto(DiscordInviteBatchMessageSchema) {}
export class DiscordInviteBatchDto extends createZodDto(DiscordInviteBatchSchema) {}
export class DiscordInviteCreateDto extends createZodDto(DiscordInviteCreateSchema) {}
export class DiscordInviteCreatedDto extends createZodDto(DiscordInviteCreatedSchema) {}
export class DiscordInviteResponseDto extends createZodDto(DiscordInviteResponseSchema) {}
export class DiscordTicketCreateDto extends createZodDto(DiscordTicketCreateSchema) {}
export class DiscordTicketUpdateDto extends createZodDto(DiscordTicketUpdateSchema) {}
export class DiscordTicketDto extends createZodDto(DiscordTicketSchema) {}
export class DiscordTicketListDto extends createZodDto(DiscordTicketListSchema) {}
export class DiscordUserSummaryDto extends createZodDto(DiscordUserSummarySchema) {}
