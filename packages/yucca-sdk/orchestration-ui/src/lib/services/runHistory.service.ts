import { sdk } from '$lib';
import ViewLogModal from '$lib/components/backups/dialogs/ViewLogModal.svelte';
import { getRunHistory, type RunDto } from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { modalManager, type ActionItem } from '@immich/ui';
import { createQuery } from '@tanstack/svelte-query';

export const runHistoryKeys = {
  byRepository: (id: string) => ['runHistory', id] as const,
};

export const useRunHistory = (repositoryId: string) =>
  createQuery(
    () => ({
      queryKey: runHistoryKeys.byRepository(repositoryId),
      queryFn: () =>
        getRunHistory(repositoryId).then(({ runs }) =>
          runs.toSorted((a, b) => b.start.localeCompare(a.start)),
        ),
    }),
    () => queryClient,
  );

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
    onAction: () => void modalManager.open(ViewLogModal, { logId: run.id }),
  };

  return { ViewLog };
};
