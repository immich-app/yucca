import { createContext } from 'svelte';
import * as yuccaApiClient from 'yucca-api-client';
import * as orchestrationApiClient from './fetch-client';

export abstract class BaseProvider {
  abstract getRepositories(): Promise<orchestrationApiClient.RepositoryListResponseDto>;
  abstract createRepository(): Promise<orchestrationApiClient.RepositoryCreateResponseDto>;
  abstract createBackup(repositoryId: string): Promise<void>;
}

export const yuccaApiProvider = {
  ...yuccaApiClient,
  async createBackup() {},
} as BaseProvider;

export const orchestrationApiProvider = orchestrationApiClient as BaseProvider;

/* eslint-disable @typescript-eslint/require-await */
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

  async createBackup() {}
}
/* eslint-enable @typescript-eslint/require-await */

export const [getProvider, setProvider] = createContext<BaseProvider>();
