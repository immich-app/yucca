import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';

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

export class RepositoryMetadataDto {
  @ApiProperty({ type: () => [String] })
  paths!: string[];
}

@ApiExtraModels(Boolean, RepositoryMetadataDto)
export class LocalRepositoryDto extends RepositoryWithMetricsDto {
  @ApiProperty({
    oneOf: [{ $ref: getSchemaPath(Boolean) }, { $ref: getSchemaPath(RepositoryMetadataDto) }],
    required: false,
  })
  local?: RepositoryMetadataDto | false;
}

export class RepositoryCreateResponseDto {
  @ApiProperty({ type: () => LocalRepositoryDto })
  repository!: LocalRepositoryDto;
}

export class RepositoryListResponseDto {
  @ApiProperty({ type: () => [LocalRepositoryDto] })
  repositories!: LocalRepositoryDto[];
}
