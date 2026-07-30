import { ApiProperty } from '@nestjs/swagger';

export class SettingsValueDto {
  @ApiProperty({ required: false })
  restic_pack_size_mib?: number;

  @ApiProperty({ required: false, description: 'Client-evaluated expression: integers, cores, min, max, + - * /' })
  connections_math?: string;
}

export class SettingsEntryDto {
  @ApiProperty({ description: "'global', 'site:<code>' or 'cluster:<code>'" })
  scope!: string;

  @ApiProperty({ type: SettingsValueDto })
  value!: SettingsValueDto;

  @ApiProperty({ type: 'string' })
  updatedAt!: Date;
}

export class SettingsEntryResponseDto {
  @ApiProperty({ type: SettingsEntryDto })
  entry!: SettingsEntryDto;
}

export class SettingsListResponseDto {
  @ApiProperty({ type: [SettingsEntryDto] })
  settings!: SettingsEntryDto[];
}
