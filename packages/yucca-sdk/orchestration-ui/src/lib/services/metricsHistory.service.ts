import { listMetricsHistory } from '@futo-org/backups-api-client';
import { createInfiniteQuery } from '@tanstack/svelte-query';
import { queryClient } from '$lib/query-client';

export const metricsHistoryKeys = {
  byRepository: (repositoryId: string) =>
    ['metricsHistory', repositoryId] as const,
};

export const useMetricsHistory = (repositoryId: string) =>
  createInfiniteQuery(
    () => ({
      queryKey: metricsHistoryKeys.byRepository(repositoryId),
      queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
        listMetricsHistory(repositoryId, { cursor: pageParam }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }),
    () => queryClient,
  );
