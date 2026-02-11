import { createContext } from 'svelte';
import * as orchestrationApiClient from './fetch-client.js';
import * as yuccaApiClient from 'yucca-api-client';
import type {
  RepositoryCreateResponseDto,
  RepositoryListResponseDto,
} from './fetch-client.js';

export abstract class BaseProvider {
  abstract getRepositories(): Promise<RepositoryListResponseDto>;
  abstract createRepository(): Promise<RepositoryCreateResponseDto>;
  abstract createBackup(id: string): Promise<void>;
}

export const yuccaApiProvider = {
  ...yuccaApiClient,
  async createBackup() {},
} as BaseProvider;

export const orchestrationApiProvider = orchestrationApiClient as BaseProvider;

/* eslint-disable @typescript-eslint/require-await */
export class MockProvider extends BaseProvider {
  async getRepositories(): Promise<RepositoryListResponseDto> {
    return {
      repositories: [
        {
          id: 'repo1',
          worm: false,
          local: false,
          metrics: {
            sizeBytes: 1337,
          },
        },
      ],
    };
  }

  async createRepository(): Promise<RepositoryCreateResponseDto> {
    return {
      repository: {
        id: 'repo' + Math.random().toString().slice(2),
        worm: false,
        local: true,
        metrics: {
          sizeBytes: 1337,
        },
      },
    };
  }

  async createBackup(_id: string): Promise<void> {
    return void 0;
  }
}
/* eslint-enable @typescript-eslint/require-await */

export const [getProvider, setProvider] = createContext<BaseProvider>();
