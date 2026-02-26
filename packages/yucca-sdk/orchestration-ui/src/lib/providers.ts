import { createContext } from 'svelte';
import * as yuccaApiClient from 'yucca-api-client';
import * as orchestrationApiClient from './fetch-client';

export abstract class BaseProvider {
  abstract getRepositories(): Promise<orchestrationApiClient.RepositoryListResponseDto>;
}

/* eslint-disable @typescript-eslint/require-await */
export const yuccaApiProvider = yuccaApiClient as BaseProvider;

export const orchestrationApiProvider = orchestrationApiClient as BaseProvider;

export class MockProvider extends BaseProvider {
  async getRepositories(): Promise<orchestrationApiClient.RepositoryListResponseDto> {
    return {
      repositories: [
        {
          id: 'repo1',
          name: 'My Repository',
          worm: false,
          metrics: {
            sizeBytes: 1337,
          },
        },
      ],
    };
  }
}
/* eslint-enable @typescript-eslint/require-await */

export const [getProvider, setProvider] = createContext<BaseProvider>();
