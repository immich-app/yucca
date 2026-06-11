import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsObject, IsString, Min } from 'class-validator';

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

export class RepositoryMetricsHistoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  repositoryId!: string;

  @ApiProperty({ type: 'string' })
  createdAt!: Date;

  @ApiProperty({ required: false })
  sizeBytes?: number;

  @ApiProperty({ type: 'string', required: false })
  started?: Date;

  @ApiProperty({ type: 'string', required: false })
  backup?: Date;

  @ApiProperty({ type: 'string', required: false })
  successfulBackup?: Date;

  @ApiProperty({ required: false })
  backupDuration?: number;
}

export class RepositoryMetricsHistoryListResponseDto {
  @ApiProperty({ type: [RepositoryMetricsHistoryDto] })
  items!: RepositoryMetricsHistoryDto[];

  @ApiProperty({ type: 'string', required: false, nullable: true })
  nextCursor!: string | null;
}

export class SubmitStructuredLogRequestDto {
  @ApiProperty()
  @IsString()
  summary!: string;

  @ApiProperty()
  @IsObject()
  data!: object;
}
