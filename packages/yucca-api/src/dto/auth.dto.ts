import { ApiProperty } from '@nestjs/swagger';
import { DeviceFlowEventType, DeviceFlowFailureReason } from 'src/enum';

export class AuthDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  connectionId!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } })
  features!: Record<string, boolean>;
}

export class DeviceFlowEventDto {
  @ApiProperty({ enum: DeviceFlowEventType, enumName: 'DeviceFlowEventType' })
  type!: DeviceFlowEventType;

  @ApiProperty({ type: String, required: false })
  userCode?: string;

  @ApiProperty({ type: String, required: false })
  verificationUri?: string;

  @ApiProperty({ type: String, required: false })
  accessToken?: string;

  @ApiProperty({ enum: DeviceFlowFailureReason, enumName: 'DeviceFlowFailureReason', required: false })
  reason?: DeviceFlowFailureReason;
}
