import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class RepositoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  worm!: boolean;

  @ApiProperty()
  name!: string;

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

  @ApiProperty({
    required: false,
    description: 'Owned connection to create the repository under (defaults to the session/default connection).',
  })
  @IsOptional()
  @IsUUID()
  connectionId?: string;
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

export class ResticUrlRequestDto {
  @ApiProperty({
    required: false,
    description: 'Token lifetime (e.g. "90d"). Defaults to RESTIC_JWT_EXPIRES_IN, capped at RESTIC_JWT_MAX_EXPIRES_IN.',
  })
  @IsOptional()
  @IsString()
  expiresIn?: string;

  @ApiProperty({ required: false, description: 'Human label for this access key (shown in the token list).' })
  @IsOptional()
  @IsString()
  label?: string;
}

export class RepositoryCreateResticUrlDto {
  @ApiProperty({ description: 'rest: URL with the embedded restic JWT — paste into `restic -r`.' })
  url!: string;

  @ApiProperty({ description: 'The minted token id, for revocation.' })
  jti!: string;

  @ApiProperty({ type: 'string' })
  expiresAt!: Date;
}

export class ResticTokenDto {
  @ApiProperty()
  jti!: string;

  @ApiProperty()
  repositoryId!: string;

  @ApiProperty({ required: false, nullable: true })
  connectionId!: string | null;

  @ApiProperty({ description: "'user' or 'admin'" })
  mintedBy!: string;

  @ApiProperty({ required: false, nullable: true })
  label!: string | null;

  @ApiProperty({ type: 'string' })
  expiresAt!: Date;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  revokedAt!: Date | null;

  @ApiProperty({ type: 'string' })
  createdAt!: Date;
}

export class ResticTokenListResponseDto {
  @ApiProperty({ type: [ResticTokenDto] })
  tokens!: ResticTokenDto[];
}
