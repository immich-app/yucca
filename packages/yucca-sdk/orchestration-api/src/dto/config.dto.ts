import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const QuietHoursSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/, 'Invalid quiet hours, expected HH:MM-HH:MM');

const BandwidthSchema = z
  .object({
    bytesPerSec: z.number().int().min(0),
    quietHours: QuietHoursSchema.optional(),
  })
  .meta({ id: 'BandwidthDto' });

const ConfigUpdateRequestSchema = z.object({ bandwidth: BandwidthSchema }).meta({ id: 'ConfigUpdateRequestDto' });

const ConfigResponseSchema = z.object({ bandwidth: BandwidthSchema }).meta({ id: 'ConfigResponseDto' });

export class BandwidthDto extends createZodDto(BandwidthSchema) {}
export class ConfigUpdateRequestDto extends createZodDto(ConfigUpdateRequestSchema) {}
export class ConfigResponseDto extends createZodDto(ConfigResponseSchema) {}
