import { sdk } from '$lib';
import ViewStatusModal from '$lib/components/backups/dialogs/ViewStatusModal.svelte';
import { SocketEvent } from '$lib/events';
import { getRun, getRunHistory, type RunDto } from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { modalManager, type ActionItem } from '@immich/ui';
import { createQuery } from '@tanstack/svelte-query';

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

export const handleGetRunHistory = async (id: string) => {
  try {
    return await sdk.getRunHistory(id);
  } catch (error) {
    handleError(error, 'Failed to load run history');
    throw error;
  }
};

export const getRunActions = (run: RunDto) => {
  const ViewLog: ActionItem = {
    title: 'View Log',
    onAction: () => void modalManager.open(ViewStatusModal, { logId: run.id }),
  };

  return { ViewLog };
};
