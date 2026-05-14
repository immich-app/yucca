import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDefined, IsIn, IsString } from 'class-validator';

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

  @ApiProperty({ enumName: 'RetentionPreset', enum: ['default', 'off'] })
  @IsIn(['default', 'off'])
  retentionPreset!: `default` | `off`;
}
