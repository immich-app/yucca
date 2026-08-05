import { ConnectionTypes } from '@common/server';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { CursorPaginationDto } from 'src/dto/pagination.dto';

export class RepositoryOwnerDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  disabled!: boolean;
}

export class RepositoryMetricsDto {
  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  lastStarted!: Date | null;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  lastBackup!: Date | null;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  lastSuccessfulBackup!: Date | null;

  @ApiProperty({ required: false, nullable: true })
  lastBackupDuration!: number | null;
}

export class RepositoryAdminDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  worm!: boolean;

  @ApiProperty({ type: 'string', description: 'Stable internal site code' })
  siteCode!: string;

  @ApiProperty({ type: 'string', description: 'Stable, globally unique internal storage cluster code' })
  storageClusterCode!: string;

  @ApiProperty()
  connectionId!: string;

  @ApiProperty()
  connectionType!: string;

  @ApiProperty()
  user!: RepositoryOwnerDto;

  @ApiProperty()
  metrics!: RepositoryMetricsDto;
}

export class RepositoryListQueryDto extends CursorPaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class RepositoryListResponseDto {
  @ApiProperty({ type: [RepositoryAdminDto] })
  items!: RepositoryAdminDto[];

  @ApiProperty({ required: false, nullable: true })
  nextCursor!: string | null;
}

export class RepositoryGetResponseDto {
  @ApiProperty()
  repository!: RepositoryAdminDto;
}

export class RepositoryCreateRequestDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ required: false, description: 'Owner; defaults to the admin service user' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  worm?: boolean;

  @ApiProperty({
    required: false,
    description: 'Internal site code to place the repository in; defaults to the topology default site',
  })
  @IsOptional()
  @IsString()
  site?: string;

  @ApiProperty({
    required: false,
    enum: ConnectionTypes,
    description: "Connection type for the owning connection; defaults to 'restic' (manual use)",
  })
  @IsOptional()
  @IsIn(ConnectionTypes)
  connectionType?: string;
}

export class RepositoryCreateResponseDto {
  @ApiProperty()
  repository!: RepositoryAdminDto;
}

export class RepositoryUrlResponseDto {
  @ApiProperty()
  url!: string;
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
  repository!: RepositoryAdminDto;
}

export class RepositoryStorageCredentialsRequestDto {
  @ApiProperty({ required: false, description: 'Issue a fresh key pair, invalidating the credentials already minted' })
  @IsOptional()
  @IsBoolean()
  rotate?: boolean;
}

export class RepositoryStorageCredentialsResponseDto {
  @ApiProperty({ description: 'RGW user that owns the repository bucket' })
  storageUserId!: string;

  @ApiProperty()
  storageClusterCode!: string;

  @ApiProperty()
  accessKeyId!: string;
}
