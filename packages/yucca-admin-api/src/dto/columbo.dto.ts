import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';

export class ColumboInvestigateRequestDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  prompt!: string;
}

export class ColumboInvestigationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['running', 'done', 'failed'] })
  status!: 'running' | 'done' | 'failed';

  @ApiProperty({ type: 'string', required: false, nullable: true })
  note!: string | null;

  @ApiProperty({ type: [String] })
  queries!: string[];

  @ApiProperty({ type: 'string', required: false, nullable: true })
  error!: string | null;
}
