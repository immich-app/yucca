import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const MetaConfigSchema = z
  .object({
    restic_pack_size_mib: z.number(),
    connections_math: z.string().describe('Client-evaluated expression: integers, cores, min, max, + - * /'),
  })
  .meta({ id: 'MetaConfigDto' });

const MetaConfigOverridesSchema = z
  .object({
    restic_pack_size_mib: z.number().optional(),
    connections_math: z.string().optional().describe('Client-evaluated expression: integers, cores, min, max, + - * /'),
  })
  .meta({ id: 'MetaConfigOverridesDto' });

const MetaClusterSchema = z
  .object({
    code: z.string(),
    display_name: z.string(),
    cluster_config: MetaConfigOverridesSchema.describe('Per-cluster overrides of the global and site config'),
  })
  .meta({ id: 'MetaClusterDto' });

const MetaSiteSchema = z
  .object({
    code: z.string(),
    display_name: z.string(),
    description: z.string(),
    rest_url: z.string(),
    default_cluster: z.string(),
    site_config: MetaConfigOverridesSchema.describe('Per-site overrides of the global config'),
    clusters: z.array(MetaClusterSchema),
  })
  .meta({ id: 'MetaSiteDto' });

const MetaResponseSchema = z
  .object({
    api_root: z.string(),
    config: MetaConfigSchema,
    default_site: z.string(),
    sites: z.array(MetaSiteSchema),
  })
  .meta({ id: 'MetaResponseDto' });

export class MetaConfigDto extends createZodDto(MetaConfigSchema) {}
export class MetaConfigOverridesDto extends createZodDto(MetaConfigOverridesSchema) {}
export class MetaClusterDto extends createZodDto(MetaClusterSchema) {}
export class MetaSiteDto extends createZodDto(MetaSiteSchema) {}
export class MetaResponseDto extends createZodDto(MetaResponseSchema) {}
