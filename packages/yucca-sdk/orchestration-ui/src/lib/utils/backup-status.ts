import type { RepositoryMetricsDto } from '$lib/fetch-client';

export type BackupOutcome = 'never' | 'complete' | 'warn' | 'incomplete' | 'failed';

export const getBackupOutcome = (metrics: RepositoryMetricsDto | undefined): BackupOutcome => {
  if (metrics?.lastBackupStatus === 'incomplete') {
    return 'incomplete';
  }

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
    default: {
      return 'complete';
    }
  }
};
