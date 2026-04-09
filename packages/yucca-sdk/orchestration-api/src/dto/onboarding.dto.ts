import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class OnboardingStatusResponseDto {
  @ApiProperty({ type: Boolean })
  hasOnboardedKey!: boolean;

  @ApiProperty({ type: Boolean })
  hasBackend!: boolean;
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
