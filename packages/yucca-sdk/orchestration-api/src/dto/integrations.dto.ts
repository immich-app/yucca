import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { RetentionPolicySchema } from './repository.dto';

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
    repositoryId: z.string().optional().describe('Bind to this existing repository instead of creating a new one'),
  })
  .meta({ id: 'ConfigureImmichIntegrationRequestDto' });

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
export class ConfigureImmichIntegrationRequestDto extends createZodDto(ConfigureImmichIntegrationRequestSchema) {}
export class ImmichRollbackRequestDto extends createZodDto(ImmichRollbackRequestSchema) {}
