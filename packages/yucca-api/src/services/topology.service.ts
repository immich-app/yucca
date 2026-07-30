import { Injectable, OnModuleInit } from '@nestjs/common';
import { env } from 'src/env';
import { StorageRepository } from 'src/repositories/storage.repository';
import { TopologyRepository } from 'src/repositories/topology.repository';

@Injectable()
export class TopologyService implements OnModuleInit {
  constructor(
    private readonly storage: StorageRepository,
    private readonly topology: TopologyRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    let raw: string;
    try {
      raw = await this.storage.readFile(env.TOPOLOGY_FILE);
    } catch (error) {
      throw new Error(`Failed to read topology file '${env.TOPOLOGY_FILE}': ${(error as Error).message}`);
    }

    try {
      this.topology.load(JSON.parse(raw));
    } catch (error) {
      throw new Error(`Invalid topology file '${env.TOPOLOGY_FILE}': ${(error as Error).message}`);
    }
  }
}
