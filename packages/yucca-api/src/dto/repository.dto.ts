import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

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

  @ApiProperty({ type: 'string', required: false })
  lastSuccessfulBackup!: Date | null;

  @ApiProperty({ required: false })
  lastBackupDuration?: number;

  @ApiProperty()
  sizeBytes!: number;
}

export class RepositoryWithMetricsDto extends RepositoryDto {
  @ApiProperty()
  metrics!: RepositoryMetricsDto;
}

export class RepositoryCreateRequestDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsBoolean()
  worm!: boolean;
}

export class RepositoryCreateResponseDto {
  @ApiProperty()
  repository!: RepositoryWithMetricsDto;
}

export class RepositoryGetResponseDto {
  @ApiProperty()
  repository!: RepositoryWithMetricsDto;
}

export class RepositoryListResponseDto {
  @ApiProperty({ type: [RepositoryWithMetricsDto] })
  repositories!: RepositoryWithMetricsDto[];
}

export class RepositoryUpdateRequestDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;
}

export class RepositoryUpdateResponseDto {
  @ApiProperty()
  repository!: RepositoryWithMetricsDto;
}

export class RepositoryCreateResticUrlDto {
  @ApiProperty()
  url!: string;
}
