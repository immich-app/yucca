import { ConnectionTypes } from '@common/server';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { RepositoryWithMetricsDto } from 'src/dto/repository.dto';

export class ConnectionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ConnectionTypes })
  type!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: 'string' })
  createdAt!: Date;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  lastSeenAt!: Date | null;

  @ApiProperty()
  repositoryCount!: number;

  @ApiProperty({ description: 'Rolled-up storage across this connection’s repositories (RGW size).' })
  sizeBytes!: number;

  @ApiProperty({ description: 'Rolled-up object count across this connection’s repositories.' })
  objectCount!: number;

  @ApiProperty({ description: 'Billed bytes: per-object min-size floor applied (immich exempt).' })
  billableBytes!: number;
}

export class ConnectionListResponseDto {
  @ApiProperty({ type: [ConnectionDto] })
  connections!: ConnectionDto[];
}

export class ConnectionCreateRequestDto {
  @ApiProperty({ enum: ConnectionTypes })
  @IsIn(ConnectionTypes)
  type!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;
}

export class ConnectionUpdateRequestDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;
}

export class ConnectionResponseDto {
  @ApiProperty()
  connection!: ConnectionDto;
}

export class ConnectionAdoptRequestDto {
  @ApiProperty({ type: [String], description: 'Repositories to move from the default connection to this one' })
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  repositoryIds!: string[];
}

// One-shot self-serve restic: get-or-create the user's restic connection, create
// a repository under it, and mint a long-lived rest: URL — everything needed to
// paste into restic and start backing up.
export class ConnectionResticRequestDto {
  @ApiProperty({ required: false, description: 'Repository name (defaults to a generated one).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false, description: 'Enable write-once (WORM) on the repository.' })
  @IsOptional()
  @IsBoolean()
  worm?: boolean;

  @ApiProperty({ required: false, description: 'Token lifetime (e.g. "90d"), capped at RESTIC_JWT_MAX_EXPIRES_IN.' })
  @IsOptional()
  @Matches(/^\d+\s*(ms|s|m|h|d|w|y)$/i, { message: 'expiresIn must be a duration like "30d", "12h"' })
  expiresIn?: string;

  @ApiProperty({ required: false, description: 'Human label for the minted access key.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class ConnectionResticResponseDto {
  @ApiProperty()
  connection!: ConnectionDto;

  @ApiProperty()
  repository!: RepositoryWithMetricsDto;

  @ApiProperty({ description: 'rest: URL with the embedded restic JWT.' })
  url!: string;

  @ApiProperty()
  jti!: string;

  @ApiProperty({ type: 'string' })
  expiresAt!: Date;
}
