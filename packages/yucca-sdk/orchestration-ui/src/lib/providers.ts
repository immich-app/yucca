import { createContext } from 'svelte';
import * as yuccaApiClient from 'yucca-api-client';
import * as orchestrationApiClient from './fetch-client';

export abstract class BaseProvider {
  abstract getRepositories(): Promise<orchestrationApiClient.RepositoryListResponseDto>;
  abstract createRepository(): Promise<orchestrationApiClient.RepositoryCreateResponseDto>;
  abstract getBackends(): Promise<orchestrationApiClient.BackendsResponseDto>;

  abstract createBackup(id: string): Promise<void>;

  abstract addRepositoryPath(
    id: string,
    dto: orchestrationApiClient.RepositoryPathRequestDto,
  ): Promise<void>;
  abstract removeRepositoryPath(
    id: string,
    dto: orchestrationApiClient.RepositoryPathRequestDto,
  ): Promise<void>;

  abstract getRunHistory(
    id: string,
  ): Promise<orchestrationApiClient.RunHistoryResponseDto>;
}

/* eslint-disable @typescript-eslint/require-await */
export const yuccaApiProvider = {
  ...yuccaApiClient,
  async getBackends() {
    return {
      backends: [],
    };
  },
  async createBackup() {},
  async addRepositoryPath() {},
  async removeRepositoryPath() {},
  async getRunHistory() {
    return {
      runs: [],
    };
  },
} as BaseProvider;

export const orchestrationApiProvider = orchestrationApiClient as BaseProvider;

export class MockProvider extends BaseProvider {
  async getRepositories(): Promise<orchestrationApiClient.RepositoryListResponseDto> {
    return {
      repositories: [
        {
          id: 'repo1',
          worm: false,
          metrics: {
            sizeBytes: 1337,
          },
        },
      ],
    };
  }

  async createRepository(): Promise<orchestrationApiClient.RepositoryCreateResponseDto> {
    return {
      repository: {
        id: 'repo' + Math.random().toString().slice(2),
        worm: false,
        metrics: {
          sizeBytes: 1337,
        },
      },
    };
  }

  async getBackends(): Promise<orchestrationApiClient.BackendsResponseDto> {
    return {
      backends: [],
    };
  }

  async createBackup() {}

  async addRepositoryPath() {}
  async removeRepositoryPath() {}

  async getRunHistory() {
    return {
      runs: [],
    };
  }
}
/* eslint-enable @typescript-eslint/require-await */

export const [getProvider, setProvider] = createContext<BaseProvider>();
