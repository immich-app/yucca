import { BadRequestException, Injectable } from '@nestjs/common';
import { env } from 'src/env';
import { readTopology, Topology, TopologySite } from 'src/topology';

@Injectable()
export class TopologyRepository {
  private source = '';
  private topology!: Topology;

  get(): Topology {
    const next = readTopology(env.TOPOLOGY_FILE);
    if (next.source !== this.source) {
      this.source = next.source;
      this.topology = next.topology;
    }
    return this.topology;
  }

  // Resolves a site by code; null/undefined selects the default for new
  // repositories. Persisted repository placement is always non-null.
  getSite(code?: string | null): TopologySite {
    const topology = this.get();
    const resolved = code ?? topology.default_site;
    const site = topology.sites.find((site) => site.code === resolved);
    if (!site) {
      throw new BadRequestException(`Unknown site '${resolved}'`);
    }

    return site;
  }

  hasSite(code: string): boolean {
    return this.get().sites.some((site) => site.code === code);
  }

  hasCluster(code: string): boolean {
    return this.get().sites.some((site) => site.clusters.some((cluster) => cluster.code === code));
  }

  // The cluster that receives newly created repositories for a site.
  getActiveCluster(site: TopologySite) {
    const active = site.clusters.find((cluster) => cluster.active);
    if (!active) {
      // Unreachable: the topology schema enforces exactly one active cluster.
      throw new Error(`Site '${site.code}' has no active cluster`);
    }

    return active;
  }
}
