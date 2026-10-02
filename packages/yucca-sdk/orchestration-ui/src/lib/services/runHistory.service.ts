import { sdk } from '$lib';
import ViewStatusModal from '$lib/components/backups/dialogs/ViewStatusModal.svelte';
import { SocketEvent } from '$lib/events';
import {
  getRun,
  getRunHistory,
  type RunDto,
  type RunStatus,
} from '$lib/fetch-client';
import { getProvider } from '$lib/providers';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import {
  modalManager,
  toastManager,
  type ActionItem,
  type ToastShow,
} from '@immich/ui';
import { createQuery } from '@tanstack/svelte-query';
import { gt, msg } from 'svelte-i18n-lingui';

export const runHistoryKeys = {
  byRepository: (id: string) => ['runHistory', id] as const,
};

export const runKeys = {
  byId: (id: string) => ['run', id] as const,
};

export const useRunHistory = (repositoryId: () => string | undefined) =>
  createQuery(
    () => ({
      queryKey: runHistoryKeys.byRepository(repositoryId() ?? ''),
      queryFn: () =>
        getRunHistory(repositoryId()!).then(({ runs }) =>
          runs.toSorted((a, b) => b.start.localeCompare(a.start)),
        ),
      enabled: repositoryId() !== undefined,
    }),
    () => queryClient,
  );

export const useRun = (logId: string) =>
  createQuery(
    () => ({
      queryKey: runKeys.byId(logId),
      queryFn: () => getRun(logId).then(({ run }) => run),
    }),
    () => queryClient,
  );

export const useRunEventHandler = () => {
  return {
    onRunCreate(event: SocketEvent<{ run: RunDto }>) {
      queryClient.setQueryData(runKeys.byId(event.data.run.id), event.data.run);
      queryClient.setQueryData(
        runHistoryKeys.byRepository(event.data.run.repositoryId),
        (data: RunDto[] | undefined) =>
          data ? [event.data.run, ...data] : void 0,
      );
    },
    onRunUpdate(
      event: SocketEvent<{
        runId: string;
        repositoryId: string;
        run: Partial<RunDto>;
      }>,
    ) {
      queryClient.setQueryData(
        runKeys.byId(event.data.runId),
        (data: RunDto | undefined) =>
          data ? { ...data, ...event.data.run } : void 0,
      );
      queryClient.setQueryData(
        runHistoryKeys.byRepository(event.data.repositoryId),
        (data: RunDto[] | undefined) =>
          data
            ? data.map((entry) =>
                entry.id === event.data.runId
                  ? { ...entry, ...event.data.run }
                  : entry,
              )
            : void 0,
      );
    },
  };
};

export const useBackupTaskMonitor = () => {
  const watching = new Set<string>();

  return {
    onRunCreate(event: SocketEvent<{ run: RunDto }>) {
      if (
        event.data.run.type === 'backup' ||
        event.data.run.type === 'schedule'
      ) {
        watching.add(event.data.run.id);
      }
    },
    onRunUpdate(event: SocketEvent<{ runId: string; run: Partial<RunDto> }>) {
      const { runId, run } = event.data;
      if (!watching.has(runId) || !run.status || run.status === 'incomplete') {
        return;
      }

      watching.delete(runId);

      const alerts: Record<Exclude<RunStatus, 'incomplete'>, ToastShow> = {
        complete: {
          color: 'success',
          title: gt`Backup complete`,
          description: gt`Library successfully backed up.`,
        },
        warn: {
          color: 'warning',
          title: gt`Backup completed with warnings`,
          description: gt`Some files could not be backed up. Check the backup log for details.`,
        },
        failed: {
          color: 'danger',
          title: gt`Backup failed`,
          description: gt`Could not finish backing up.`,
        },
        cancelled: {
          color: 'secondary',
          title: gt`Backup cancelled`,
          description: gt`The backup was stopped before it finished.`,
        },
      };

      toastManager.show(alerts[run.status], { closable: true });
    },
  };
};

export const handleGetRunHistory = async (id: string) => {
  try {
    return await sdk.getRunHistory(id);
  } catch (error) {
    handleError(error, gt`Failed to load run history`);
    throw error;
  }
};

export const getRunActions = (run: RunDto, t: typeof gt) => {
  const ViewLog: ActionItem = {
    title: t(msg`View Log`),
    onAction: () => void modalManager.open(ViewStatusModal, { logId: run.id }),
  };

  const DownloadLog: ActionItem = {
    title: t(msg`Download Full Log`),
    onAction: () =>
      window.open(
        `${getProvider().baseUrl}/api/yucca/logs/${run.id}/download`,
        '_blank',
      ),
  };

  return { ViewLog, DownloadLog };
};
