import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { DeviceFlowEventType, DeviceFlowFailureReason } from '../enum';

export class DeviceFlowEventDto {
  @ApiProperty({ enum: DeviceFlowEventType, enumName: 'DeviceFlowEventType' })
  type!: DeviceFlowEventType;

  @ApiProperty({ type: String, required: false })
  userCode?: string;

  @ApiProperty({ type: String, required: false })
  verificationUri?: string;

  @ApiProperty({ type: String, required: false })
  token?: string;

  @ApiProperty({ type: String, required: false })
  backendId?: string;

  @ApiProperty({ enum: DeviceFlowFailureReason, enumName: 'DeviceFlowFailureReason', required: false })
  reason?: DeviceFlowFailureReason;
}

export class CreateSessionRequestDto {
  @ApiProperty()
  @IsString()
  token!: string;
}
