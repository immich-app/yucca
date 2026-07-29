import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RepositoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  worm!: boolean;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: 'string', nullable: true, description: 'Stable internal site code the repository lives in' })
  siteCode!: string | null;

  @ApiProperty({ type: 'string', nullable: true, description: 'Stable, globally unique internal storage cluster code' })
  storageClusterCode!: string | null;

  @ApiProperty()
  connectionId!: string;

  @ApiProperty()
  connectionType!: string;
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

export class RepositoryMeterDto {
  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  objectCount!: number;

  @ApiProperty({ type: 'string', required: false })
  lastUpdated!: Date | null;
}

export class RepositoryWithMetricsDto extends RepositoryDto {
  @ApiProperty()
  metrics!: RepositoryMetricsDto;

  @ApiProperty({ type: RepositoryMeterDto, required: false })
  meter?: RepositoryMeterDto;
}

export class RepositoryCreateRequestDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsBoolean()
  worm!: boolean;

  @ApiProperty({ required: false, description: 'Internal site code from /meta; defaults to default_site' })
  @IsOptional()
  @IsString()
  site?: string;
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

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  worm?: boolean;
}

export class RepositoryUpdateResponseDto {
  @ApiProperty()
  repository!: RepositoryWithMetricsDto;
}

export class RepositoryCreateResticUrlDto {
  @ApiProperty()
  url!: string;
}
