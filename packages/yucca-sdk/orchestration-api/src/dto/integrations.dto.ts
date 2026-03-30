import { ApiProperty } from '@nestjs/swagger';

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

export class ImmichIntegrationConfigDto {
  @ApiProperty({ type: String })
  dataPath!: string;

  @ApiProperty({ type: [String] })
  dataFolders!: string[];

  @ApiProperty({ type: [ImmichLibraryDto] })
  libraries!: ImmichLibraryDto[];
}

export class IntegrationsResponseDto {
  @ApiProperty({ type: ImmichIntegrationConfigDto, required: false })
  immich?: ImmichIntegrationConfigDto;
}
