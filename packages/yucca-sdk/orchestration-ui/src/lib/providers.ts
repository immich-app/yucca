import * as yuccaApiClient from '@futo-org/backups-api-client';
import * as orchestrationApiClient from './fetch-client';

export type YuccaApi = 'orchestrator' | 'customer';

type GetRepositories =
  () => Promise<orchestrationApiClient.RepositoryListResponseDto>;

export type YuccaProvider = {
  api: YuccaApi;
  baseUrl: string;
  getRepositories: GetRepositories;
};

export type YuccaOptions = {
  api: YuccaApi;
  baseUrl?: string;
};

const clients = {
  orchestrator: orchestrationApiClient,
  customer: yuccaApiClient,
};

const KEY = '__yucca_provider__';

export const configureYucca = ({ api, baseUrl }: YuccaOptions): YuccaProvider => {
  const client = clients[api];
  if (baseUrl !== undefined) {
    client.defaults.baseUrl = baseUrl;
  }

  const provider: YuccaProvider = {
    api,
    baseUrl: client.defaults.baseUrl.replace(/\/$/, ''),
    getRepositories: client.getRepositories as GetRepositories,
  };
  (globalThis as any)[KEY] = provider;
  return provider;
};

export const getProvider = (): YuccaProvider => {
  const provider = (globalThis as any)[KEY] as YuccaProvider | undefined;
  if (!provider) {
    throw new Error(
      'Yucca is not configured: call configureYucca() before rendering any component',
    );
  }
  return provider;
};
