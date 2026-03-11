/* eslint-disable @typescript-eslint/require-await */

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryGetResponseDto,
  RepositoryListResponseDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
} from 'yucca-api-client';
import { BackendType } from '../enum';
import { BackendConfiguration } from '../schema/tables/backend.table';
import { Backend } from './backend';

export class LocalBackend extends Backend {
  constructor(protected readonly configuration: BackendConfiguration & { type: BackendType.Local }) {
    super(configuration);
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
        name: dto.name,
        worm: false,
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

  async getResticEndpoint(id: string): Promise<string> {
    return resolve(this.configuration.path, id);
  }
}
