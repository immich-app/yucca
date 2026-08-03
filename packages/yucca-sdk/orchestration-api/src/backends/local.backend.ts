/* eslint-disable @typescript-eslint/require-await */

import {
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryGetResponseDto,
  RepositoryListResponseDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
} from '@futo-org/backups-api-client';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BackendType } from '../enum';
import { BackendConfiguration } from '../schema/tables/backend.table';
import { Backend } from './backend';

export class LocalBackend extends Backend {
  constructor(protected readonly configuration: BackendConfiguration & { type: BackendType.Local }) {
    super(configuration);
  }

  isBackupCapable(): boolean {
    return true;
  }

  isMetricsCapable(): boolean {
    return false;
  }

  async checkOnline(): Promise<void> {}

  async createRepository(dto: RepositoryCreateRequestDto): Promise<RepositoryCreateResponseDto> {
    const id = randomUUID();

    await mkdir(resolve(this.configuration.path, id), {
      recursive: true,
    });

    return {
      repository: {
        id,
        name: dto.name,
        worm: dto.worm,
        siteCode: null,
        storageClusterCode: null,
        connectionId: '',
        connectionType: 'local',
        metrics: {
          sizeBytes: 0,
        },
      },
    };
  }

  async updateRepository(id: string, dto: RepositoryUpdateRequestDto): Promise<RepositoryUpdateResponseDto> {
    return {
      repository: {
        id,
        name: dto.name ?? 'new name',
        worm: false,
        siteCode: null,
        storageClusterCode: null,
        connectionId: '',
        connectionType: 'local',
        metrics: {
          sizeBytes: 0,
        },
      },
    };
  }

  getRepository(_id: string): Promise<RepositoryGetResponseDto> {
    throw new Error('Method not implemented.');
  }

  async getRepositories(): Promise<RepositoryListResponseDto> {
    let files: string[];
    try {
      files = await readdir(resolve(this.configuration.path));
    } catch {
      files = [];
    }

    return {
      repositories: await Promise.all(files.map((path) => stat(resolve(this.configuration.path, path)))).then((list) =>
        list
          .map((f, index) =>
            f.isDirectory()
              ? {
                  id: files[index],
                  name: 'Unknown',
                  worm: false,
                  siteCode: null,
                  storageClusterCode: null,
                  connectionId: '',
                  connectionType: 'local',
                  metrics: {
                    sizeBytes: 0, // in local cache
                  },
                }
              : null,
          )
          .filter((f) => f !== null),
      ),
    };
  }

  async deleteRepository(_id: string): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async getResticEndpoint(id: string): Promise<string> {
    return resolve(this.configuration.path, id);
  }

  submitMetricBackupStart(): Promise<void> {
    throw new Error('not capable');
  }

  submitMetricBackupEnd(): Promise<void> {
    throw new Error('not capable');
  }

  submitMetricRepositorySize(): Promise<void> {
    throw new Error('not capable');
  }

  submitStructuredLog(): void {
    throw new Error('not capable');
  }
}
