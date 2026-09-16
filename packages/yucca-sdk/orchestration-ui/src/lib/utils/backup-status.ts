import type { RepositoryMetricsDto } from '$lib/fetch-client';

export type BackupOutcome = 'never' | 'complete' | 'warn' | 'incomplete' | 'failed';

export const getBackupOutcome = (metrics: RepositoryMetricsDto | undefined): BackupOutcome => {
  if (!metrics?.lastBackup) {
    return 'never';
  }

  switch (metrics.lastBackupStatus) {
    case 'failed': {
      return 'failed';
    }
    case 'warn': {
      return 'warn';
    }
    case 'incomplete': {
      return 'incomplete';
    }
    default: {
      return 'complete';
    }
  }
};
