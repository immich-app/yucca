import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { TaskStatus, TaskType } from '../enum';
import { BackendTypeSchema } from './backend.dto';
import { TaskStatusSchema } from './runningTasks.dto';

export const RetentionPolicySchema = z
  .object({
    keepLast: z.int().optional(),
    keepWithin: z.string().optional(),
    keepWithinHourly: z.string().optional(),
    keepWithinDaily: z.string().optional(),
    keepWithinWeekly: z.string().optional(),
    keepWithinMonthly: z.string().optional(),
    keepWithinYearly: z.string().optional(),
  })
  .meta({ id: 'RetentionPolicyDto' });

const RepositorySchema = z
  .object({
    id: z.string(),
    worm: z.boolean(),
    name: z.string(),
    siteCode: z.string().nullable(),
    storageClusterCode: z.string().nullable(),
  })
  .meta({ id: 'RepositoryDto' });

const RepositoryMetricsSchema = z
  .object({
    lastBackup: z.string().nullable().optional(),
    lastBackupStatus: TaskStatusSchema.optional(),
    lastBackupDuration: z.int().optional(),
    sizeBytes: z.int(),
  })
  .meta({ id: 'RepositoryMetricsDto' });

const RepositoryMeterSchema = z
  .object({
    sizeBytes: z.int(),
    objectCount: z.int(),
    lastUpdated: z.string().nullable().optional(),
  })
  .meta({ id: 'RepositoryMeterDto' });

const RepositoryWithMetricsSchema = RepositorySchema.extend({
  metrics: RepositoryMetricsSchema,
  meter: RepositoryMeterSchema.optional(),
}).meta({ id: 'RepositoryWithMetricsDto' });

const RepositoryBackendSchema = z
  .object({
    id: z.string(),
    type: BackendTypeSchema,
    online: z.boolean(),
  })
  .meta({ id: 'RepositoryBackendDto' });

const RepositoryBackendsSchema = z
  .object({
    primary: RepositoryBackendSchema,
    secondary: z.array(RepositoryBackendSchema),
  })
  .meta({ id: 'RepositoryBackendsDto' });

const RepositoryConfigurationSchema = z
  .object({
    paths: z.array(z.string()),
    retentionPolicy: RetentionPolicySchema.nullable().optional(),
  })
  .meta({ id: 'RepositoryConfigurationDto' });

const LocalRepositorySchema = RepositoryWithMetricsSchema.extend({
  backends: RepositoryBackendsSchema.optional(),
  configuration: RepositoryConfigurationSchema.optional(),
}).meta({ id: 'LocalRepositoryDto' });

const RepositoryCreateRequestSchema = z
  .object({
    name: z.string(),
    worm: z.boolean(),
    site: z.string().optional().describe('Internal site code from environment metadata'),
    paths: z.array(z.string()).optional(),
  })
  .meta({ id: 'RepositoryCreateRequestDto' });

const RepositoryCreateResponseSchema = z
  .object({ repository: LocalRepositorySchema })
  .meta({ id: 'RepositoryCreateResponseDto' });

const RepositoryLinkRequestSchema = z
  .object({
    remoteId: z.string().describe('Identifier of the existing repository on the backend'),
    paths: z.array(z.string()).optional().describe('Defaults to the paths of the most recent snapshot'),
  })
  .meta({ id: 'RepositoryLinkRequestDto' });

const RepositoryPrimaryBackendReconfigureRequestSchema = z
  .object({ backendId: z.string() })
  .meta({ id: 'RepositoryPrimaryBackendReconfigureRequestDto' });

const RepositoryUpdateRequestSchema = z
  .object({
    name: z.string().optional(),
    worm: z.boolean().optional(),
    paths: z.array(z.string()).optional(),
    retentionPolicy: RetentionPolicySchema.nullable().optional(),
  })
  .meta({ id: 'RepositoryUpdateRequestDto' });

const RepositoryUpdateResponseSchema = z
  .object({ repository: LocalRepositorySchema })
  .meta({ id: 'RepositoryUpdateResponseDto' });

const RepositoryListResponseSchema = z
  .object({ repositories: z.array(LocalRepositorySchema) })
  .meta({ id: 'RepositoryListResponseDto' });

const RepositoryCheckImportResponseSchema = z
  .object({ readable: z.boolean() })
  .meta({ id: 'RepositoryCheckImportResponseDto' });

const RunSchema = z
  .object({
    id: z.string(),
    repositoryId: z.string(),
    start: z.string(),
    end: z.string().optional(),
    logFilePath: z.string(),
    status: z.enum(TaskStatus).meta({ id: 'RunStatus' }),
    type: z.enum(TaskType).meta({ id: 'RunType' }),
  })
  .meta({ id: 'RunDto' });

const RunHistoryResponseSchema = z.object({ runs: z.array(RunSchema) }).meta({ id: 'RunHistoryResponseDto' });

const RunResponseSchema = z.object({ run: RunSchema }).meta({ id: 'RunResponseDto' });

const SnapshotSummarySchema = z
  .object({
    filesNew: z.int(),
    filesChanged: z.int(),
    filesUnmodified: z.int(),
    totalFiles: z.int(),
    totalBytes: z.int(),
    dataAdded: z.int(),
  })
  .meta({ id: 'SnapshotSummaryDto' });

const SnapshotSchema = z
  .object({
    id: z.string(),
    time: z.string(),
    paths: z.array(z.string()),
    tags: z.array(z.string()).optional(),
    summary: SnapshotSummarySchema.optional(),
  })
  .meta({ id: 'SnapshotDto' });

const ListSnapshotsResponseSchema = z
  .object({ snapshots: z.array(SnapshotSchema) })
  .meta({ id: 'ListSnapshotsResponseDto' });

const GetSnapshotResponseSchema = z.object({ snapshot: SnapshotSchema }).meta({ id: 'GetSnapshotResponseDto' });

const RepositorySnapshotRestoreRequestSchema = z
  .object({
    target: z.string().optional(),
    include: z.array(z.string()).optional(),
  })
  .meta({ id: 'RepositorySnapshotRestoreRequestDto' });

const RepositorySnapshotRestoreFromPointRequestSchema = z
  .object({
    yuccaConfig: z.string().optional(),
    include: z.array(z.string()).optional(),
  })
  .meta({ id: 'RepositorySnapshotRestoreFromPointRequestDto' });

const LogResponseSchema = z.object({ logId: z.string() }).meta({ id: 'LogResponseDto' });

const InspectedLocalRepositorySchema = LocalRepositorySchema.extend({
  snapshots: z.array(SnapshotSchema).optional(),
}).meta({ id: 'InspectedLocalRepositoryDto' });

const RepositoryInspectResponseSchema = z
  .object({ repositories: z.array(InspectedLocalRepositorySchema) })
  .meta({ id: 'RepositoryInspectResponseDto' });

export class RetentionPolicyDto extends createZodDto(RetentionPolicySchema) {}
export class RepositoryDto extends createZodDto(RepositorySchema) {}
export class RepositoryMetricsDto extends createZodDto(RepositoryMetricsSchema) {}
export class RepositoryMeterDto extends createZodDto(RepositoryMeterSchema) {}
export class RepositoryWithMetricsDto extends createZodDto(RepositoryWithMetricsSchema) {}
export class RepositoryBackendDto extends createZodDto(RepositoryBackendSchema) {}
export class RepositoryBackendsDto extends createZodDto(RepositoryBackendsSchema) {}
export class RepositoryConfigurationDto extends createZodDto(RepositoryConfigurationSchema) {}
export class LocalRepositoryDto extends createZodDto(LocalRepositorySchema) {}
export class RepositoryCreateRequestDto extends createZodDto(RepositoryCreateRequestSchema) {}
export class RepositoryCreateResponseDto extends createZodDto(RepositoryCreateResponseSchema) {}
export class RepositoryLinkRequestDto extends createZodDto(RepositoryLinkRequestSchema) {}
export class RepositoryPrimaryBackendReconfigureRequestDto extends createZodDto(
  RepositoryPrimaryBackendReconfigureRequestSchema,
) {}
export class RepositoryUpdateRequestDto extends createZodDto(RepositoryUpdateRequestSchema) {}
export class RepositoryUpdateResponseDto extends createZodDto(RepositoryUpdateResponseSchema) {}
export class RepositoryListResponseDto extends createZodDto(RepositoryListResponseSchema) {}
export class RepositoryCheckImportResponseDto extends createZodDto(RepositoryCheckImportResponseSchema) {}
export class RunDto extends createZodDto(RunSchema) {}
export class RunHistoryResponseDto extends createZodDto(RunHistoryResponseSchema) {}
export class RunResponseDto extends createZodDto(RunResponseSchema) {}
export class SnapshotSummaryDto extends createZodDto(SnapshotSummarySchema) {}
export class SnapshotDto extends createZodDto(SnapshotSchema) {}
export class ListSnapshotsResponseDto extends createZodDto(ListSnapshotsResponseSchema) {}
export class GetSnapshotResponseDto extends createZodDto(GetSnapshotResponseSchema) {}
export class RepositorySnapshotRestoreRequestDto extends createZodDto(RepositorySnapshotRestoreRequestSchema) {}
export class RepositorySnapshotRestoreFromPointRequestDto extends createZodDto(
  RepositorySnapshotRestoreFromPointRequestSchema,
) {}
export class LogResponseDto extends createZodDto(LogResponseSchema) {}
export class InspectedLocalRepositoryDto extends createZodDto(InspectedLocalRepositorySchema) {}
export class RepositoryInspectResponseDto extends createZodDto(RepositoryInspectResponseSchema) {}
