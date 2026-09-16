import { isoDatetimeToDate } from '@common/server';
import { createZodDto } from 'nestjs-zod';
import { BackupStatus } from 'src/enum';
import { z } from 'zod';

export const BackupStatusSchema = z.enum(BackupStatus).meta({ id: 'BackupStatus' });

const SubmitBackupEndRequestSchema = z
  .object({
    status: BackupStatusSchema.optional(),
    // TODO: drop support for `success` once new metrics consumers rolled out
    // remove the line below, the `.refine` and `.transform` statements
    success: z.boolean().optional(),
    durationMs: z.int().min(0),
  })
  .refine(({ status, success }) => status !== undefined || success !== undefined, {
    message: 'Either status or success is required',
    path: ['status'],
  })
  .transform(({ status, success, durationMs }) => ({
    status: status ?? (success ? BackupStatus.Complete : BackupStatus.Failed),
    durationMs,
  }))
  .meta({ id: 'SubmitBackupEndRequestDto' });

const SubmitUpdateSizeRequestSchema = z
  .object({ sizeBytes: z.int().min(0) })
  .meta({ id: 'SubmitUpdateSizeRequestDto' });

const RepositoryMetricsHistorySchema = z
  .object({
    id: z.string(),
    repositoryId: z.string(),
    createdAt: isoDatetimeToDate,
    sizeBytes: z.number().nullable().optional(),
    started: isoDatetimeToDate.nullable().optional(),
    backup: isoDatetimeToDate.nullable().optional(),
    backupStatus: BackupStatusSchema.nullable().optional(),
    backupDuration: z.number().nullable().optional(),
  })
  .meta({ id: 'RepositoryMetricsHistoryDto' });

const RepositoryMetricsHistoryListResponseSchema = z
  .object({
    items: z.array(RepositoryMetricsHistorySchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'RepositoryMetricsHistoryListResponseDto' });

const SubmitStructuredLogRequestSchema = z
  .object({
    summary: z.string(),
    data: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'SubmitStructuredLogRequestDto' });

export class SubmitBackupEndRequestDto extends createZodDto(SubmitBackupEndRequestSchema) {}
export class SubmitUpdateSizeRequestDto extends createZodDto(SubmitUpdateSizeRequestSchema) {}
export class RepositoryMetricsHistoryDto extends createZodDto(RepositoryMetricsHistorySchema) {}
export class RepositoryMetricsHistoryListResponseDto extends createZodDto(RepositoryMetricsHistoryListResponseSchema) {}
export class SubmitStructuredLogRequestDto extends createZodDto(SubmitStructuredLogRequestSchema) {}
