import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDefined, IsObject, IsOptional, IsString } from 'class-validator';
import { RetentionPolicyDto } from './repository.dto';

export class ImmichLibraryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: [String] })
  importPaths!: string[];

  @ApiProperty({ type: [String] })
  exclusionPatterns!: string[];
}

export class ImmichStateDto {
  @ApiProperty({ type: String })
  dataPath!: string;

  @ApiProperty({ type: [String] })
  dataFolders!: string[];

  @ApiProperty({ type: [ImmichLibraryDto] })
  libraries!: ImmichLibraryDto[];
}

export class ImmichIntegrationConfigurationDto {
  @ApiProperty({ type: [String] })
  dataFolders!: string[];

  @ApiProperty({ type: Boolean })
  backupConfiguration!: boolean;

  @ApiProperty({
    oneOf: [
      { type: 'string', enum: ['all'] },
      { type: 'array', items: { type: 'string' } },
    ],
  })
  libraries!: 'all' | string[];
}

export class ImmichIntegrationDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  scheduleId!: string;

  @ApiProperty({ type: ImmichIntegrationConfigurationDto })
  configuration!: ImmichIntegrationConfigurationDto;
}

export class IntegrationsResponseDto {
  @ApiProperty({ type: ImmichStateDto, required: false })
  immichState?: ImmichStateDto;

  @ApiProperty({ type: ImmichIntegrationDto, required: false })
  immichIntegration?: ImmichIntegrationDto;
}

export class ConfigureImmichIntegrationRequestDto {
  @ApiProperty({ type: String })
  @IsString()
  name!: string;

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  worm!: boolean;

  @ApiProperty({ type: String })
  @IsString()
  cron!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  dataFolders!: string[];

  @ApiProperty({ type: Boolean })
  @IsBoolean()
  backupConfiguration!: boolean;

  @ApiProperty({
    oneOf: [
      { type: 'string', enum: ['all'] },
      { type: 'array', items: { type: 'string' } },
    ],
  })
  @IsDefined()
  libraries!: 'all' | string[];

  @ApiProperty({ type: RetentionPolicyDto, required: false, nullable: true })
  @IsOptional()
  @IsObject()
  retentionPolicy?: RetentionPolicyDto | null;

  @ApiProperty({ type: Boolean, required: false })
  @IsOptional()
  @IsBoolean()
  paused?: boolean;
}

export class ImmichRollbackRequestDto {
  @ApiProperty({ type: String })
  @IsString()
  repositoryId!: string;

  @ApiProperty({ type: String })
  @IsString()
  snapshotId!: string;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  backupFileName?: string;
}
