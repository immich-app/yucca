import { ApiProperty } from '@nestjs/swagger';
import { BackendType, TaskStatus } from '../enum';

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
  name!: string;

  @ApiProperty({ type: Boolean })
  worm!: boolean;
}

export class RepositoryCreateResponseDto {
  @ApiProperty({ type: LocalRepositoryDto })
  repository!: LocalRepositoryDto;
}

export class RepositoryUpdateRequestDto {
  @ApiProperty()
  name!: string;
}

export class RepositoryUpdateResponseDto {
  @ApiProperty()
  repository!: LocalRepositoryDto;
}

export class RepositoryListResponseDto {
  @ApiProperty({ type: [LocalRepositoryDto] })
  repositories!: LocalRepositoryDto[];
}

export class RepositoryPathRequestDto {
  @ApiProperty({ type: String })
  path!: string;
}

export class RepositoryCheckImportResponseDto {
  @ApiProperty({ type: Boolean })
  readable!: boolean;
}

export class RunDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  start!: string;

  @ApiProperty({ type: String })
  end?: string;

  @ApiProperty({ type: String })
  logFilePath!: string;

  @ApiProperty({ enumName: 'RunStatus', enum: TaskStatus })
  status!: TaskStatus;
}

export class RunHistoryResponseDto {
  @ApiProperty({ type: [RunDto] })
  runs!: RunDto[];
}

export class SnapshotDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  time!: string;
}

export class ListSnapshotsResponseDto {
  @ApiProperty({ type: [SnapshotDto] })
  snapshots!: SnapshotDto[];
}

export class LogResponseDto {
  @ApiProperty({ type: String })
  logId!: string;
}
