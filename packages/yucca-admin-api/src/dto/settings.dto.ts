import { isoDatetimeToDate } from '@common/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const SettingsValueSchema = z
  .object({
    restic_pack_size_mib: z.number().optional(),
    connections_math: z.string().optional().describe('Client-evaluated expression: integers, cores, min, max, + - * /'),
  })
  .meta({ id: 'SettingsValueDto' });

const SettingsEntrySchema = z
  .object({
    scope: z.string().describe("'global', 'site:<code>' or 'cluster:<code>'"),
    value: SettingsValueSchema,
    updatedAt: isoDatetimeToDate,
  })
  .meta({ id: 'SettingsEntryDto' });

const SettingsEntryResponseSchema = z.object({ entry: SettingsEntrySchema }).meta({ id: 'SettingsEntryResponseDto' });

const SettingsListResponseSchema = z
  .object({ settings: z.array(SettingsEntrySchema) })
  .meta({ id: 'SettingsListResponseDto' });

export class SettingsValueDto extends createZodDto(SettingsValueSchema) {}
export class SettingsEntryDto extends createZodDto(SettingsEntrySchema) {}
export class SettingsEntryResponseDto extends createZodDto(SettingsEntryResponseSchema) {}
export class SettingsListResponseDto extends createZodDto(SettingsListResponseSchema) {}
