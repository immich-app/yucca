import { ConnectionTypes, isoDatetimeToDate } from '@common/server';
import { createZodDto } from 'nestjs-zod';
import { CursorPaginationSchema } from 'src/dto/pagination.dto';
import { z } from 'zod';

const RepositoryOwnerSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    disabled: z.boolean(),
  })
  .meta({ id: 'RepositoryOwnerDto' });

const RepositoryMetricsSchema = z
  .object({
    sizeBytes: z.number(),
    lastStarted: isoDatetimeToDate.nullable(),
    lastBackup: isoDatetimeToDate.nullable(),
    lastSuccessfulBackup: isoDatetimeToDate.nullable(),
    lastBackupDuration: z.number().nullable(),
  })
  .meta({ id: 'RepositoryMetricsDto' });

const RepositoryAdminSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    worm: z.boolean(),
    siteCode: z.string().describe('Stable internal site code'),
    storageClusterCode: z.string().describe('Stable, globally unique internal storage cluster code'),
    connectionId: z.string(),
    connectionType: z.string(),
    user: RepositoryOwnerSchema,
    metrics: RepositoryMetricsSchema,
  })
  .meta({ id: 'RepositoryAdminDto' });

const RepositoryListQuerySchema = CursorPaginationSchema.extend({ userId: z.uuid().optional() }).meta({
  id: 'RepositoryListQueryDto',
});

const RepositoryListResponseSchema = z
  .object({
    items: z.array(RepositoryAdminSchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'RepositoryListResponseDto' });

const RepositoryGetResponseSchema = z
  .object({ repository: RepositoryAdminSchema })
  .meta({ id: 'RepositoryGetResponseDto' });

const RepositoryCreateRequestSchema = z
  .object({
    name: z.string(),
    userId: z.uuid().optional().describe('Owner; defaults to the admin service user'),
    worm: z.boolean().optional(),
    site: z
      .string()
      .optional()
      .describe('Internal site code to place the repository in; defaults to the topology default site'),
    connectionType: z
      .enum(ConnectionTypes)
      .optional()
      .describe("Connection type for the owning connection; defaults to 'restic' (manual use)"),
  })
  .meta({ id: 'RepositoryCreateRequestDto' });

const RepositoryCreateResponseSchema = z
  .object({ repository: RepositoryAdminSchema })
  .meta({ id: 'RepositoryCreateResponseDto' });

const RepositoryUrlResponseSchema = z.object({ url: z.string() }).meta({ id: 'RepositoryUrlResponseDto' });

const RepositoryUpdateRequestSchema = z
  .object({
    name: z.string().optional(),
    worm: z.boolean().optional(),
  })
  .meta({ id: 'RepositoryUpdateRequestDto' });

const RepositoryUpdateResponseSchema = z
  .object({ repository: RepositoryAdminSchema })
  .meta({ id: 'RepositoryUpdateResponseDto' });

export class RepositoryOwnerDto extends createZodDto(RepositoryOwnerSchema) {}
export class RepositoryMetricsDto extends createZodDto(RepositoryMetricsSchema) {}
export class RepositoryAdminDto extends createZodDto(RepositoryAdminSchema) {}
export class RepositoryListQueryDto extends createZodDto(RepositoryListQuerySchema) {}
export class RepositoryListResponseDto extends createZodDto(RepositoryListResponseSchema) {}
export class RepositoryGetResponseDto extends createZodDto(RepositoryGetResponseSchema) {}
export class RepositoryCreateRequestDto extends createZodDto(RepositoryCreateRequestSchema) {}
export class RepositoryCreateResponseDto extends createZodDto(RepositoryCreateResponseSchema) {}
export class RepositoryUrlResponseDto extends createZodDto(RepositoryUrlResponseSchema) {}
export class RepositoryUpdateRequestDto extends createZodDto(RepositoryUpdateRequestSchema) {}
export class RepositoryUpdateResponseDto extends createZodDto(RepositoryUpdateResponseSchema) {}
