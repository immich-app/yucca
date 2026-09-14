import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BackendSchema } from './backend.dto';
import { LocalRepositorySchema, RetentionPolicySchema, RunSchema } from './repository.dto';
import { ScheduleSchema } from './schedule.dto';

const LibrariesSchema = z.union([z.literal('all'), z.array(z.string())]);

const ImmichLibrarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    importPaths: z.array(z.string()),
    exclusionPatterns: z.array(z.string()),
  })
  .meta({ id: 'ImmichLibraryDto' });

const ImmichStateSchema = z
  .object({
    dataPath: z.string(),
    dataFolders: z.array(z.string()),
    libraries: z.array(ImmichLibrarySchema),
  })
  .meta({ id: 'ImmichStateDto' });

const ImmichIntegrationConfigurationSchema = z
  .object({
    dataFolders: z.array(z.string()),
    backupConfiguration: z.boolean(),
    libraries: LibrariesSchema,
  })
  .meta({ id: 'ImmichIntegrationConfigurationDto' });

const ImmichIntegrationSchema = z
  .object({
    id: z.string(),
    scheduleId: z.string(),
    configuration: ImmichIntegrationConfigurationSchema,
  })
  .meta({ id: 'ImmichIntegrationDto' });

const IntegrationsResponseSchema = z
  .object({
    immichState: ImmichStateSchema.optional(),
    immichIntegration: ImmichIntegrationSchema.optional(),
  })
  .meta({ id: 'IntegrationsResponseDto' });

const ImmichBackupStatusSchema = z
  .object({
    integration: ImmichIntegrationSchema.optional(),
    repository: LocalRepositorySchema.optional(),
    backend: BackendSchema.optional(),
    schedule: ScheduleSchema.optional(),
    latestBackupRun: RunSchema.optional(),
  })
  .meta({ id: 'ImmichBackupStatusDto' });

const ConfigureImmichIntegrationRequestSchema = z
  .object({
    name: z.string(),
    worm: z.boolean(),
    cron: z.string(),
    dataFolders: z.array(z.string()),
    backupConfiguration: z.boolean(),
    libraries: LibrariesSchema,
    retentionPolicy: RetentionPolicySchema.nullable().optional(),
    paused: z.boolean().optional(),
  })
  .meta({ id: 'ConfigureImmichIntegrationRequestDto' });

const ConfigureImmichIntegrationResponseSchema = z
  .object({
    repositoryId: z.string(),
  })
  .meta({ id: 'ConfigureImmichIntegrationResponseDto' });

const ImmichRollbackRequestSchema = z
  .object({
    repositoryId: z.string(),
    snapshotId: z.string(),
    backupFileName: z.string().optional(),
  })
  .meta({ id: 'ImmichRollbackRequestDto' });

export class ImmichLibraryDto extends createZodDto(ImmichLibrarySchema) {}
export class ImmichStateDto extends createZodDto(ImmichStateSchema) {}
export class ImmichIntegrationConfigurationDto extends createZodDto(ImmichIntegrationConfigurationSchema) {}
export class ImmichIntegrationDto extends createZodDto(ImmichIntegrationSchema) {}
export class IntegrationsResponseDto extends createZodDto(IntegrationsResponseSchema) {}
export class ImmichBackupStatusDto extends createZodDto(ImmichBackupStatusSchema) {}
export class ConfigureImmichIntegrationRequestDto extends createZodDto(ConfigureImmichIntegrationRequestSchema) {}
export class ConfigureImmichIntegrationResponseDto extends createZodDto(ConfigureImmichIntegrationResponseSchema) {}
export class ImmichRollbackRequestDto extends createZodDto(ImmichRollbackRequestSchema) {}
