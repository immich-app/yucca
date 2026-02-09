import { createContext } from 'svelte';
import * as yuccaApiClient from 'yucca-api-client';
import * as orchestrationApiClient from './fetch-client.ts';

export abstract class BaseProvider {
  abstract getRepositories(): Promise<yuccaApiClient.RepositoryListResponseDto>;
  abstract createRepository(): Promise<yuccaApiClient.RepositoryCreateResponseDto>;
  // abstract createResticUrl(
  //   id: string,
  // ): Promise<yuccaApiClient.RepositoryCreateResticUrlDto>;
}

export const yuccaApiProvider = yuccaApiClient as BaseProvider;
export const orchestrationApiProvider = orchestrationApiClient as BaseProvider;

/* eslint-disable @typescript-eslint/require-await */
export class MockProvider extends BaseProvider {
  async getRepositories(): Promise<yuccaApiClient.RepositoryListResponseDto> {
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

  async createRepository(): Promise<yuccaApiClient.RepositoryCreateResponseDto> {
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

  async createResticUrl(
    id: string,
  ): Promise<yuccaApiClient.RepositoryCreateResticUrlDto> {
    return {
      url: `http://example.com/${id}`,
    };
  }
}
/* eslint-enable @typescript-eslint/require-await */

export const [getProvider, setProvider] = createContext<BaseProvider>();
