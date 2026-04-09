import { ApiProperty } from '@nestjs/swagger';
import { BackendType } from '../enum';

export class BackendDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ enumName: 'BackendType', enum: BackendType })
  type!: BackendType;

  @ApiProperty({ type: Boolean })
  isOnline!: boolean;

  @ApiProperty({ type: String, required: false })
  error?: string;
}

export class BackendsResponseDto {
  @ApiProperty({ type: [BackendDto] })
  backends!: BackendDto[];
}
