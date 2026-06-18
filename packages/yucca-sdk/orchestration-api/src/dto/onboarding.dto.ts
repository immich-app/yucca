import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { BootstrapStatus, TelemetryLevel } from '../enum';

export class OnboardingStatusResponseDto {
  @ApiProperty({ enum: BootstrapStatus, enumName: 'BootstrapStatus' })
  status!: BootstrapStatus;

  @ApiProperty({ type: String, required: false })
  error?: string;

  @ApiProperty({ enum: TelemetryLevel, enumName: 'TelemetryLevel' })
  hasTelemetry!: TelemetryLevel;

  @ApiProperty({ type: Boolean })
  hasOnboardedKey!: boolean;

  @ApiProperty({ type: Boolean })
  hasBackend!: boolean;

  @ApiProperty({ type: Boolean })
  hasBackup!: boolean;

  @ApiProperty({ type: Boolean })
  hasSchedule!: boolean;

  @ApiProperty({ type: Boolean })
  hasSkippedExtraConfig!: boolean;
}

export class CurrentRecoveryKeyResponse {
  @ApiProperty({ type: String })
  recoveryKey!: string;
}

export class ImportRecoveryKeyRequest {
  @ApiProperty({ type: String })
  @IsString()
  recoveryKey!: string;
}
