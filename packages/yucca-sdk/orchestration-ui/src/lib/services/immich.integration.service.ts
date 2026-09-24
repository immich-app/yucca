import BackupsRecoveryKeyModal from '$lib/components/onboarding/dialogs/BackupsRecoveryKeyModal.svelte';
import { modalManager, type ActionItem } from '@immich/ui';
import { mdiCloudUploadOutline, mdiCogOutline, mdiKeyOutline } from '@mdi/js';
import {
  configureImmichDatabaseDump,
  type ConfigureImmichDatabaseDumpRequestDto,
  getImmichBackupStatus,
  ignoreImmichDatabaseDumpWarning,
  type ImmichBackupStatusDto,
} from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { getBackupOutcome } from '$lib/utils/backup-status';
import { createMutation, createQuery } from '@tanstack/svelte-query';
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

const updateImmichBackupStatus = (
  update: (data: ImmichBackupStatusDto) => ImmichBackupStatusDto,
) =>
  queryClient.setQueryData<ImmichBackupStatusDto>(
    immichBackupStatusKeys.all,
    (data) => data && update(data),
  );

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
  | {
      kind: 'complete' | 'warn' | 'incomplete' | 'failed' | 'cancelled';
      lastBackup: string;
    };

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
    get needsAttention() {
      const usingImmichDbDump =
        query.data?.databaseDump?.enabled === true &&
        query.data.schedule !== undefined &&
        !query.data.schedule.paused &&
        query.data.databaseDumpWarningIgnored !== true;

      return usingImmichDbDump;
    },
  };
};

export const useConfigureImmichDatabaseDump = () =>
  createMutation(
    () => ({
      mutationFn: (dto: ConfigureImmichDatabaseDumpRequestDto) =>
        configureImmichDatabaseDump(dto),
      onSuccess: (_, dto) =>
        updateImmichBackupStatus((data) => ({
          ...data,
          databaseDump: data.databaseDump && { ...data.databaseDump, ...dto },
        })),
      onError: (error) =>
        handleError(error, 'Failed to update Immich database dump settings'),
    }),
    () => queryClient,
  );

export const useIgnoreImmichDatabaseDumpWarning = () =>
  createMutation(
    () => ({
      mutationFn: () => ignoreImmichDatabaseDumpWarning(),
      onSuccess: () =>
        updateImmichBackupStatus((data) => ({
          ...data,
          databaseDumpWarningIgnored: true,
        })),
      onError: (error) =>
        handleError(error, 'Failed to ignore Immich database dump warning'),
    }),
    () => queryClient,
  );
