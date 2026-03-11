import { ApiProperty } from '@nestjs/swagger';

export class RepositoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  worm!: boolean;

  @ApiProperty()
  name!: string;
}

export class RepositoryMetricsDto {
  @ApiProperty({ type: 'string', required: false })
  lastBackup!: Date | null;

  @ApiProperty()
  sizeBytes!: number;
}

export class RepositoryWithMetricsDto extends RepositoryDto {
  @ApiProperty()
  metrics!: RepositoryMetricsDto;
}

export class RepositoryCreateRequestDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  worm!: boolean;
}

export class RepositoryCreateResponseDto {
  @ApiProperty()
  repository!: RepositoryWithMetricsDto;
}

export class RepositoryUpdateRequestDto {
  @ApiProperty()
  name!: string;
}

export class RepositoryUpdateResponseDto {
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
