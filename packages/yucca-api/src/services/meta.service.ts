import { Injectable } from '@nestjs/common';
import { MetaResponseDto } from 'src/dto/meta.dto';
import { env } from 'src/env';
import { SettingsRepository } from 'src/repositories/settings.repository';
import { TopologyRepository } from 'src/repositories/topology.repository';
import { DEFAULT_CONFIG } from 'src/utils/settings';

@Injectable()
export class MetaService {
  constructor(
    private readonly topology: TopologyRepository,
    private readonly settings: SettingsRepository,
  ) {}

  async getMeta(): Promise<MetaResponseDto> {
    const overrides = await this.settings.getAll();
    const topology = this.topology.get();

    return {
      api_root: env.API_ROOT,
      config: { ...DEFAULT_CONFIG, ...overrides['global'] },
      default_site: topology.default_site,
      sites: topology.sites.map((site) => ({
        code: site.code,
        display_name: site.display_name,
        description: site.description,
        rest_url: site.rest_url,
        default_cluster: site.default_cluster,
        site_config: overrides[`site:${site.code}`] ?? {},
        clusters: site.clusters.map((cluster) => ({
          code: cluster.code,
          display_name: cluster.display_name,
          cluster_config: overrides[`cluster:${cluster.code}`] ?? {},
        })),
      })),
    };
  }
}
