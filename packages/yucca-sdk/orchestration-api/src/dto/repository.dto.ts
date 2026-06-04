import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { BackendType, TaskStatus, TaskType } from '../enum';
import type { RunType } from '../schema/tables/runHistory.table';

export class RetentionPolicyDto {
  @ApiProperty({ type: Number, required: false })
  keepLast?: number;

  @ApiProperty({ type: String, required: false })
  keepWithin?: string;

  @ApiProperty({ type: String, required: false })
  keepWithinHourly?: string;

  @ApiProperty({ type: String, required: false })
  keepWithinDaily?: string;

  @ApiProperty({ type: String, required: false })
  keepWithinWeekly?: string;

  @ApiProperty({ type: String, required: false })
  keepWithinMonthly?: string;

  @ApiProperty({ type: String, required: false })
  keepWithinYearly?: string;
}

export class RepositoryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: Boolean })
  worm!: boolean;

  @ApiProperty({ type: String })
  name!: string;
}

export class RepositoryMetricsDto {
  @ApiProperty({ type: String, required: false })
  lastBackup?: string;

  @ApiProperty({ type: String, required: false })
  lastSuccessfulBackup?: string;

  @ApiProperty({ type: Number, required: false })
  lastBackupDuration?: number;

  @ApiProperty({ type: Number })
  sizeBytes!: number;
}

export class RepositoryWithMetricsDto extends RepositoryDto {
  @ApiProperty({ type: RepositoryMetricsDto })
  metrics!: RepositoryMetricsDto;
}

export class RepositoryBackendDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ enumName: 'BackendType', enum: BackendType })
  type!: BackendType;

  @ApiProperty({ type: Boolean })
  online!: boolean;
}

export class RepositoryBackendsDto {
  @ApiProperty({ type: RepositoryBackendDto })
  primary!: RepositoryBackendDto;

  @ApiProperty({ type: [RepositoryBackendDto] })
  secondary!: RepositoryBackendDto[];
}

export class RepositoryConfigurationDto {
  @ApiProperty({ type: [String] })
  paths!: string[];

  @ApiProperty({ type: RetentionPolicyDto, required: false, nullable: true })
  retentionPolicy!: RetentionPolicyDto | null;
}

export class LocalRepositoryDto extends RepositoryWithMetricsDto {
  @ApiProperty({ type: RepositoryBackendsDto, required: false })
  backends?: RepositoryBackendsDto;

  @ApiProperty({
    type: RepositoryConfigurationDto,
    required: false,
  })
  configuration?: RepositoryConfigurationDto;
}

export class RepositoryCreateRequestDto {
  @ApiProperty({ type: String })
  @IsString()
  name!: string;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  worm!: boolean;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paths?: string[];
}

export class RepositoryCreateResponseDto {
  @ApiProperty({ type: LocalRepositoryDto })
  repository!: LocalRepositoryDto;
}

export class RepositoryPrimaryBackendReconfigureRequestDto {
  @ApiProperty({ type: String, required: true })
  @IsString()
  backendId!: string;
}

export class RepositoryUpdateRequestDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paths?: string[];

  @ApiProperty({ type: RetentionPolicyDto, required: false, nullable: true })
  @IsOptional()
  @IsObject()
  retentionPolicy?: RetentionPolicyDto | null;
}

export class RepositoryUpdateResponseDto {
  @ApiProperty()
  repository!: LocalRepositoryDto;
}

export class RepositoryListResponseDto {
  @ApiProperty({ type: [LocalRepositoryDto] })
  repositories!: LocalRepositoryDto[];
}

export class RepositoryCheckImportResponseDto {
  @ApiProperty({ type: Boolean })
  readable!: boolean;
}

export class RunDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  repositoryId!: string;

  @ApiProperty({ type: String })
  start!: string;

  @ApiProperty({ type: String })
  end?: string;

  @ApiProperty({ type: String })
  logFilePath!: string;

  @ApiProperty({ enumName: 'RunStatus', enum: TaskStatus })
  status!: TaskStatus;

  @ApiProperty({ enumName: 'RunType', enum: TaskType })
  type!: RunType;
}

export class RunHistoryResponseDto {
  @ApiProperty({ type: [RunDto] })
  runs!: RunDto[];
}

export class RunResponseDto {
  @ApiProperty({ type: RunDto })
  run!: RunDto;
}

export class SnapshotSummaryDto {
  @ApiProperty({ type: Number })
  filesNew!: number;

  @ApiProperty({ type: Number })
  filesChanged!: number;

  @ApiProperty({ type: Number })
  filesUnmodified!: number;

  @ApiProperty({ type: Number })
  totalFiles!: number;

  @ApiProperty({ type: Number })
  totalBytes!: number;

  @ApiProperty({ type: Number })
  dataAdded!: number;
}

export class SnapshotDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  time!: string;

  @ApiProperty({ type: [String] })
  paths!: string[];

  @ApiProperty({ type: SnapshotSummaryDto, required: false })
  summary?: SnapshotSummaryDto;
}

export class ListSnapshotsResponseDto {
  @ApiProperty({ type: [SnapshotDto] })
  snapshots!: SnapshotDto[];
}

export class RepositorySnapshotRestoreRequestDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  target?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  include?: string[];
}

export class RepositorySnapshotRestoreFromPointRequestDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  yuccaConfig?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  include?: string[];
}

export class LogResponseDto {
  @ApiProperty({ type: String })
  logId!: string;
}

export class InspectedLocalRepositoryDto extends LocalRepositoryDto {
  @ApiProperty({ type: [SnapshotDto] })
  snapshots?: SnapshotDto[];
}

export class RepositoryInspectResponseDto {
  @ApiProperty({ type: [InspectedLocalRepositoryDto] })
  repositories!: InspectedLocalRepositoryDto[];
}
