import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Min } from 'class-validator';

export class SubmitBackupEndRequestDto {
  @ApiProperty()
  @IsBoolean()
  success!: boolean;

  @ApiProperty()
  @IsInt()
  @Min(0)
  durationMs!: number;
}

export class SubmitUpdateSizeRequestDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  sizeBytes!: number;
}
