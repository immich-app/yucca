import * as yuccaApiClient from '@futo-org/backups-api-client';
import * as orchestrationApiClient from './fetch-client';

export abstract class BaseProvider {
  abstract getRepositories(): Promise<orchestrationApiClient.RepositoryListResponseDto>;
}

export const yuccaApiProvider = yuccaApiClient as BaseProvider;

export const orchestrationApiProvider = orchestrationApiClient as BaseProvider;

const KEY = '__yucca_provider__';

export const setProvider = (provider: BaseProvider) => {
  (globalThis as any)[KEY] = provider;
};

export const getProvider = (): BaseProvider => {
  const provider = (globalThis as any)[KEY] as BaseProvider | undefined;
  if (!provider) {
    throw new Error(
      'Provider not set — call setProvider() before getProvider()',
    );
  }
  return provider;
};
