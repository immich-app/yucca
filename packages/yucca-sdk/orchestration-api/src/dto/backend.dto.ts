import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { BackendType } from '../enum';

export class BackendDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ enumName: 'BackendType', enum: BackendType })
  type!: BackendType;

  @ApiProperty({ type: String })
  description!: string;

  @ApiProperty({ type: Boolean })
  isOnline!: boolean;

  @ApiProperty({ type: String, required: false })
  error?: string;
}

export class BackendsResponseDto {
  @ApiProperty({ type: [BackendDto] })
  backends!: BackendDto[];
}

export class BackendResponseDto {
  @ApiProperty({ type: BackendDto })
  backend!: BackendDto;
}

export class CreateLocalBackendRequestDto {
  @ApiProperty({ type: String })
  @IsString()
  path!: string;
}
