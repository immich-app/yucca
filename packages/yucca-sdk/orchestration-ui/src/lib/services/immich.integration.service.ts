import BackupsRecoveryKeyModal from '$lib/components/onboarding/dialogs/BackupsRecoveryKeyModal.svelte';
import { modalManager, type ActionItem } from '@immich/ui';
import { mdiCloudUploadOutline, mdiCogOutline, mdiKeyOutline } from '@mdi/js';
import {
  getImmichBackupStatus,
  type ImmichBackupStatusDto,
} from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { getBackupOutcome } from '$lib/utils/backup-status';
import { createQuery } from '@tanstack/svelte-query';
import { handleCreateBackup } from './repository.service';

export const getBackupPageActions = (
  repositoryId: string | undefined,
  onConfigure: () => void,
) => {
  const Configure: ActionItem = {
    title: 'Configure',
    icon: mdiCogOutline,
    onAction: onConfigure,
  };

  const ViewRecoveryKey: ActionItem = {
    title: 'View recovery key',
    icon: mdiKeyOutline,
    onAction: () => void modalManager.show(BackupsRecoveryKeyModal, {}),
  };

  const BackUpNow: ActionItem = {
    title: 'Back up now',
    icon: mdiCloudUploadOutline,
    onAction: () => void handleCreateBackup(repositoryId!),
    $if: () => typeof repositoryId === 'string',
  };

  return { Configure, ViewRecoveryKey, BackUpNow };
};

export const immichBackupStatusKeys = {
  all: ['immichBackupStatus'] as const,
};

const invalidateImmichBackupStatus = () =>
  void queryClient.invalidateQueries({
    queryKey: immichBackupStatusKeys.all,
  });

export const useImmichBackupStatusEventHandler = () => ({
  onIntegrationUpdate: invalidateImmichBackupStatus,
  onRepositoryUpdate: invalidateImmichBackupStatus,
  onRepositoryDelete: invalidateImmichBackupStatus,
  onScheduleUpdate: invalidateImmichBackupStatus,
  onRunCreate: invalidateImmichBackupStatus,
  onRunUpdate: invalidateImmichBackupStatus,
});

export type ImmichBackupStatus =
  | {
      kind:
        | 'loading'
        | 'offline'
        | 'missing'
        | 'running'
        | 'paused'
        | 'unconfigured'
        | 'never';
    }
  | { kind: 'complete' | 'warn' | 'failed'; lastBackup: string };

const toImmichBackupStatus = (
  data: ImmichBackupStatusDto | undefined,
  loading: boolean,
): ImmichBackupStatus => {
  if (loading || !data) {
    return { kind: 'loading' };
  }

  if (data.backend?.isOnline === false) {
    return { kind: 'offline' };
  }

  if (data.repository?.backends?.primary.online === false) {
    return { kind: 'missing' };
  }

  if (data.latestBackupRun?.status === 'incomplete') {
    return { kind: 'running' };
  }

  const outcome = getBackupOutcome(data.repository?.metrics);
  const lastBackup = data.repository?.metrics.lastBackup;

  if (lastBackup && outcome !== 'never') {
    return { kind: outcome, lastBackup };
  }

  if (data.schedule?.paused) {
    return { kind: 'paused' };
  }

  return { kind: data.repository ? 'never' : 'unconfigured' };
};

export const useImmichBackupStatus = () => {
  const query = createQuery(
    () => ({
      queryKey: immichBackupStatusKeys.all,
      queryFn: () => getImmichBackupStatus(),
    }),
    () => queryClient,
  );

  return {
    get repository() {
      return query.data?.repository;
    },
    get schedule() {
      return query.data?.schedule;
    },
    get status() {
      return toImmichBackupStatus(query.data, query.isLoading);
    },
  };
};
