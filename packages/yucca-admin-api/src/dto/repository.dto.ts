import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
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
}

export class RepositoryCreateResponseDto {
  @ApiProperty()
  repository!: RepositoryAdminDto;
}

export class RepositoryUrlResponseDto {
  @ApiProperty({ description: 'restic rest: URL with an embedded repository token' })
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
