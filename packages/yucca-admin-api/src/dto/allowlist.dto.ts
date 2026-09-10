import { isoDatetimeToDate } from '@common/server';
import { createZodDto } from 'nestjs-zod';
import { CursorPaginationSchema } from 'src/dto/pagination.dto';
import { z } from 'zod';

const AllowlistEntrySchema = z
  .object({
    id: z.string(),
    email: z.string().nullable(),
    inviteCode: z.string(),
    invited: z.boolean(),
    inviteUsed: z.boolean(),
    inviteUsedAt: isoDatetimeToDate.nullable(),
    inviteEmailSentAt: isoDatetimeToDate.nullable(),
    createdAt: isoDatetimeToDate,
  })
  .meta({ id: 'AllowlistEntryDto' });

const AllowlistListQuerySchema = z.object(CursorPaginationSchema.shape).meta({ id: 'AllowlistListQueryDto' });

const AllowlistListResponseSchema = z
  .object({
    items: z.array(AllowlistEntrySchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'AllowlistListResponseDto' });

const AllowlistAddRequestSchema = z
  .object({
    email: z.email(),
    staged: z.boolean().optional().describe('Stage the entry without allowing login yet'),
  })
  .meta({ id: 'AllowlistAddRequestDto' });

const AllowlistInviteRequestSchema = z
  .object({ emails: z.array(z.email()).nonempty() })
  .meta({ id: 'AllowlistInviteRequestDto' });

const AllowlistInviteBatchRequestSchema = z
  .object({ count: z.int().min(1).max(500) })
  .meta({ id: 'AllowlistInviteBatchRequestDto' });

const AllowlistEntryResponseSchema = z
  .object({ entry: AllowlistEntrySchema })
  .meta({ id: 'AllowlistEntryResponseDto' });

const AllowlistEntriesResponseSchema = z
  .object({ items: z.array(AllowlistEntrySchema) })
  .meta({ id: 'AllowlistEntriesResponseDto' });

export class AllowlistEntryDto extends createZodDto(AllowlistEntrySchema) {}
export class AllowlistListQueryDto extends createZodDto(AllowlistListQuerySchema) {}
export class AllowlistListResponseDto extends createZodDto(AllowlistListResponseSchema) {}
export class AllowlistAddRequestDto extends createZodDto(AllowlistAddRequestSchema) {}
export class AllowlistInviteRequestDto extends createZodDto(AllowlistInviteRequestSchema) {}
export class AllowlistInviteBatchRequestDto extends createZodDto(AllowlistInviteBatchRequestSchema) {}
export class AllowlistEntryResponseDto extends createZodDto(AllowlistEntryResponseSchema) {}
export class AllowlistEntriesResponseDto extends createZodDto(AllowlistEntriesResponseSchema) {}
