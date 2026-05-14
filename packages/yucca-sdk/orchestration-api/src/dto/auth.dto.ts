import { ApiProperty } from '@nestjs/swagger';

export class DeviceFlowResponseDto {
  @ApiProperty()
  userCode!: string;

  @ApiProperty()
  verificationUri!: string;
}
