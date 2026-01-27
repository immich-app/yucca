import { ApiProperty } from '@nestjs/swagger';

export class RepositoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  worm!: boolean;
}

export class RepositoryMetricsDto {
  @ApiProperty({ type: 'string', required: false })
  lastUpload!: Date | null;

  @ApiProperty()
  sizeBytes!: number;
}

export class RepositoryWithMetricsDto extends RepositoryDto {
  @ApiProperty()
  metrics!: RepositoryMetricsDto;
}

export class RepositoryCreateResponseDto {
  @ApiProperty()
  repository!: RepositoryWithMetricsDto;
}

export class RepositoryListResponseDto {
  @ApiProperty({ type: [RepositoryWithMetricsDto] })
  repositories!: RepositoryWithMetricsDto[];
}

export class RepositoryCreateResticUrlDto {
  @ApiProperty()
  url!: string;
}
