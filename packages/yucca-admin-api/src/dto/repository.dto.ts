import { ConsumerTypes } from '@common/server';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
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
  consumerId!: string;

  @ApiProperty()
  consumerType!: string;

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
    enum: ConsumerTypes,
    description: "Consumer type for the owning consumer; defaults to 'restic' (manual use)",
  })
  @IsOptional()
  @IsIn(ConsumerTypes)
  consumerType?: string;
}

export class RepositoryUrlRequestDto {
  @ApiProperty({ required: false, description: "Token TTL like '30d'; defaults to RESTIC_JWT_EXPIRES_IN, capped" })
  @IsOptional()
  @Matches(/^\d+\s*(ms|s|m|h|d|w|y)$/i, { message: 'expiresIn must be a duration like "30d", "12h"' })
  expiresIn?: string;

  @ApiProperty({ required: false, description: 'Label stored on the token for auditing' })
  @IsOptional()
  @IsString()
  label?: string;
}

export class RepositoryCreateResponseDto {
  @ApiProperty()
  repository!: RepositoryAdminDto;
}

export class RepositoryUrlResponseDto {
  @ApiProperty({ description: 'restic rest: URL with an embedded repository token' })
  url!: string;

  @ApiProperty({ description: 'jti of the embedded token, for auditing and revocation' })
  jti!: string;

  @ApiProperty({ type: 'string', description: 'expiry of the embedded token' })
  expiresAt!: Date;
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
