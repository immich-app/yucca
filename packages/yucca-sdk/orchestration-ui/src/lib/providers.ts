import * as yuccaApiClient from 'yucca-api-client';
import * as orchestrationApiClient from './fetch-client';

export type DashboardStatus =
  | 'failed'
  | 'in-progress'
  | 'success'
  | 'never-run';
export type DashboardDelay = '8hr' | '4hr' | 'on-time' | 'never-run';

export type Dashboard = {
  status: Record<string, DashboardStatus>;
  onTime: Record<string, DashboardDelay>;
  // storageBreakdown: Record<string, >;
  currentUsage: number;
  periodStart: string;
  lastPeriodUsage: number;
  estimatedUsage: number;
  storedData: number;
  // storedData24Hrs: number;
  // avgBackupTime: number;
  // dailyBackupTime: number;
  // dedupRatio: number;
};

export abstract class BaseProvider {
  abstract getDashboard(): Promise<Dashboard>;
  abstract getRepositories(): Promise<orchestrationApiClient.RepositoryListResponseDto>;
}

/* eslint-disable @typescript-eslint/require-await */
export const yuccaApiProvider = yuccaApiClient as BaseProvider;

export const orchestrationApiProvider = orchestrationApiClient as BaseProvider;

export class MockProvider extends BaseProvider {
  async getDashboard(): Promise<Dashboard> {
    return {
      status: {
        a: 'failed',
        b: 'in-progress',
        c: 'failed',
        d: 'success',
        e: 'success',
        f: 'success',
        g: 'success',
        h: 'success',
        i: 'never-run',
      },
      onTime: {
        a: '8hr',
        b: 'on-time',
        c: '4hr',
        d: 'on-time',
        e: 'on-time',
        f: 'on-time',
        g: 'on-time',
        h: 'on-time',
        i: 'never-run',
      },
      currentUsage: 2.43,
      periodStart: new Date('2026-03-01').toISOString(),
      lastPeriodUsage: 12.3,
      estimatedUsage: 13.52,
      storedData: 8_720_000_000,
    };
  }

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
