import { ApiProperty } from '@nestjs/swagger';

export class MetaConfigDto {
  @ApiProperty()
  restic_pack_size_mib!: number;

  @ApiProperty({ description: 'Client-evaluated expression: integers, cores, min, max, + - * /' })
  connections_math!: string;
}

export class MetaConfigOverridesDto {
  @ApiProperty({ required: false })
  restic_pack_size_mib?: number;

  @ApiProperty({ required: false, description: 'Client-evaluated expression: integers, cores, min, max, + - * /' })
  connections_math?: string;
}

export class MetaClusterDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  display_name!: string;

  @ApiProperty({ description: 'Per-cluster overrides of the global and site config' })
  cluster_config!: MetaConfigOverridesDto;
}

export class MetaSiteDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  display_name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  rest_url!: string;

  @ApiProperty()
  default_cluster!: string;

  @ApiProperty({ description: 'Per-site overrides of the global config' })
  site_config!: MetaConfigOverridesDto;

  @ApiProperty({ type: [MetaClusterDto] })
  clusters!: MetaClusterDto[];
}

export class MetaResponseDto {
  @ApiProperty()
  api_root!: string;

  @ApiProperty()
  config!: MetaConfigDto;

  @ApiProperty()
  default_site!: string;

  @ApiProperty({ type: [MetaSiteDto] })
  sites!: MetaSiteDto[];
}
