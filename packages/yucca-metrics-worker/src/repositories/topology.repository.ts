import { Injectable } from '@nestjs/common';
import { env } from 'src/env';
import { readTopology, Topology } from 'src/topology';

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
}
