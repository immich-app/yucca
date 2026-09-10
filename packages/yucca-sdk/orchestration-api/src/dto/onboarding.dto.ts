import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BootstrapStatus, TelemetryLevel } from '../enum';

const OnboardingStatusResponseSchema = z
  .object({
    status: z.enum(BootstrapStatus).meta({ id: 'BootstrapStatus' }),
    error: z.string().optional(),
    hasTelemetry: z.enum(TelemetryLevel).meta({ id: 'TelemetryLevel' }),
    requiresAuthentication: z.boolean(),
    isAuthenticated: z.boolean(),
    hasOnboardedKey: z.boolean(),
    hasBackend: z.boolean(),
    hasBackup: z.boolean(),
    hasSchedule: z.boolean(),
    hasSkippedExtraConfig: z.boolean(),
  })
  .meta({ id: 'OnboardingStatusResponseDto' });

const CurrentRecoveryKeyResponseSchema = z
  .object({ recoveryKey: z.string() })
  .meta({ id: 'CurrentRecoveryKeyResponse' });

const ImportRecoveryKeyRequestSchema = z.object({ recoveryKey: z.string() }).meta({ id: 'ImportRecoveryKeyRequest' });

export class OnboardingStatusResponseDto extends createZodDto(OnboardingStatusResponseSchema) {}
export class CurrentRecoveryKeyResponse extends createZodDto(CurrentRecoveryKeyResponseSchema) {}
export class ImportRecoveryKeyRequest extends createZodDto(ImportRecoveryKeyRequestSchema) {}
