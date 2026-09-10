import { isoDatetimeToDate } from '@common/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const RepositorySchema = z
  .object({
    id: z.string(),
    worm: z.boolean(),
    name: z.string(),
    siteCode: z.string().nullable().describe('Stable internal site code the repository lives in'),
    storageClusterCode: z.string().nullable().describe('Stable, globally unique internal storage cluster code'),
    connectionId: z.string(),
    connectionType: z.string(),
  })
  .meta({ id: 'RepositoryDto' });

export const RepositoryMetricsSchema = z
  .object({
    lastBackup: isoDatetimeToDate.nullable(),
    lastSuccessfulBackup: isoDatetimeToDate.nullable(),
    lastBackupDuration: z.number().optional(),
    sizeBytes: z.number(),
  })
  .meta({ id: 'RepositoryMetricsDto' });

export const RepositoryMeterSchema = z
  .object({
    sizeBytes: z.number(),
    objectCount: z.number(),
    lastUpdated: isoDatetimeToDate.nullable(),
  })
  .meta({ id: 'RepositoryMeterDto' });

const RepositoryWithMetricsSchema = RepositorySchema.extend({
  metrics: RepositoryMetricsSchema,
  meter: RepositoryMeterSchema.optional(),
}).meta({ id: 'RepositoryWithMetricsDto' });

const RepositoryCreateRequestSchema = z
  .object({
    name: z.string(),
    worm: z.boolean(),
    site: z.string().optional().describe('Internal site code from /meta; defaults to default_site'),
  })
  .meta({ id: 'RepositoryCreateRequestDto' });

const RepositoryUpdateRequestSchema = z
  .object({
    name: z.string().optional(),
    worm: z.boolean().optional(),
  })
  .meta({ id: 'RepositoryUpdateRequestDto' });

const RepositoryCreateResponseSchema = z
  .object({ repository: RepositoryWithMetricsSchema })
  .meta({ id: 'RepositoryCreateResponseDto' });

const RepositoryGetResponseSchema = z
  .object({ repository: RepositoryWithMetricsSchema })
  .meta({ id: 'RepositoryGetResponseDto' });

const RepositoryListResponseSchema = z
  .object({ repositories: z.array(RepositoryWithMetricsSchema) })
  .meta({ id: 'RepositoryListResponseDto' });

const RepositoryUpdateResponseSchema = z
  .object({ repository: RepositoryWithMetricsSchema })
  .meta({ id: 'RepositoryUpdateResponseDto' });

const RepositoryCreateResticUrlSchema = z.object({ url: z.string() }).meta({ id: 'RepositoryCreateResticUrlDto' });

export class RepositoryDto extends createZodDto(RepositorySchema) {}
export class RepositoryMetricsDto extends createZodDto(RepositoryMetricsSchema) {}
export class RepositoryMeterDto extends createZodDto(RepositoryMeterSchema) {}
export class RepositoryWithMetricsDto extends createZodDto(RepositoryWithMetricsSchema) {}
export class RepositoryCreateRequestDto extends createZodDto(RepositoryCreateRequestSchema) {}
export class RepositoryCreateResponseDto extends createZodDto(RepositoryCreateResponseSchema) {}
export class RepositoryGetResponseDto extends createZodDto(RepositoryGetResponseSchema) {}
export class RepositoryListResponseDto extends createZodDto(RepositoryListResponseSchema) {}
export class RepositoryUpdateRequestDto extends createZodDto(RepositoryUpdateRequestSchema) {}
export class RepositoryUpdateResponseDto extends createZodDto(RepositoryUpdateResponseSchema) {}
export class RepositoryCreateResticUrlDto extends createZodDto(RepositoryCreateResticUrlSchema) {}
