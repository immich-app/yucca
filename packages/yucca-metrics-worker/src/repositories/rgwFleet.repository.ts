import { Injectable } from '@nestjs/common';
import { env } from 'src/env';
import { RgwRepository } from 'src/repositories/rgw.repository';
import { Topology, TopologyRepository } from 'src/repositories/topology.repository';

export type FleetCluster = { siteCode: string; clusterCode: string; rgw: RgwRepository };

@Injectable()
export class RgwFleetRepository {
  private fleet: FleetCluster[] = [];
  private topologySnapshot?: Topology;

  constructor(private readonly topology: TopologyRepository) {}

  private rebuild(topology: Topology): void {
    const nextFleet: FleetCluster[] = [];
    for (const site of topology.sites) {
      for (const cluster of site.clusters) {
        if (!cluster.rgw_admin_endpoint) {
          continue;
        }

        const suffix = cluster.code.toUpperCase().replaceAll('-', '_');
        const accessKeyId = process.env[`RADOS_ACCESS_KEY_ID_${suffix}`] ?? env.RADOS_ACCESS_KEY_ID;
        const secretAccessKey = process.env[`RADOS_SECRET_ACCESS_KEY_${suffix}`] ?? env.RADOS_SECRET_ACCESS_KEY;
        if (!accessKeyId || !secretAccessKey) {
          throw new Error(
            `No RGW admin credentials for cluster '${cluster.code}' ` +
              `(set RADOS_ACCESS_KEY_ID_${suffix}/RADOS_SECRET_ACCESS_KEY_${suffix} or the RADOS_* fallback, ` +
              `or remove rgw_admin_endpoint from the topology entry)`,
          );
        }

        nextFleet.push({
          siteCode: site.code,
          clusterCode: cluster.code,
          rgw: new RgwRepository({
            clusterCode: cluster.code,
            endpoint: new URL(cluster.rgw_admin_endpoint),
            accessKeyId,
            secretAccessKey,
          }),
        });
      }
    }
    this.fleet = nextFleet;
    this.topologySnapshot = topology;
  }

  clusters(): FleetCluster[] {
    const topology = this.topology.get();
    if (topology !== this.topologySnapshot) {
      this.rebuild(topology);
    }
    return this.fleet;
  }
}
