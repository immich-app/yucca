import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { BackendType } from '../enum';

export class RepositoryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: Boolean })
  worm!: boolean;
}

export class RepositoryMetricsDto {
  @ApiProperty({ type: String, required: false })
  lastUpload?: string;

  @ApiProperty({ type: Number })
  sizeBytes!: number;
}

export class RepositoryWithMetricsDto extends RepositoryDto {
  @ApiProperty({ type: () => RepositoryMetricsDto })
  metrics!: RepositoryMetricsDto;
}

export class RepositoryBackendDto {
  @ApiProperty({ type: () => String })
  id!: string;

  @ApiProperty({ enumName: 'BackendType', enum: BackendType })
  type!: BackendType;
}

export class RepositoryBackendsDto {
  @ApiProperty({ type: () => RepositoryBackendDto })
  primary!: RepositoryBackendDto;

  @ApiProperty({ type: () => [RepositoryBackendDto] })
  secondary!: RepositoryBackendDto[];
}

export class RepositoryConfigurationDto {
  @ApiProperty({ type: () => [String] })
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

export class RepositoryCreateResponseDto {
  @ApiProperty({ type: () => LocalRepositoryDto })
  repository!: LocalRepositoryDto;
}

export class RepositoryListResponseDto {
  @ApiProperty({ type: () => [LocalRepositoryDto] })
  repositories!: LocalRepositoryDto[];
}
