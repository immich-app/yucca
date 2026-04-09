import { sdk } from '$lib';
import { getRunHistory } from '$lib/fetch-client';
import { handleError } from '$lib/utils/handle-error';
import { createQuery } from '@tanstack/svelte-query';

export const runHistoryKeys = {
  byRepository: (id: string) => ['runHistory', id] as const,
};

export const useRunHistory = (repositoryId: string) =>
  createQuery(() => ({
    queryKey: runHistoryKeys.byRepository(repositoryId),
    queryFn: () =>
      getRunHistory(repositoryId).then(({ runs }) =>
        runs.toSorted((a, b) => b.start.localeCompare(a.start)),
      ),
  }));

export const handleGetRunHistory = async (id: string) => {
  try {
    return await sdk.getRunHistory(id);
  } catch (error) {
    handleError(error, 'Failed to load run history');
    throw error;
  }
};
