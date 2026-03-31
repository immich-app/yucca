import { sdk } from '$lib';
import {
  getSnapshots,
  type RepositorySnapshotRestoreRequestDto,
  type SnapshotDto,
} from '$lib/fetch-client';
import { toastManager } from '@immich/ui';
import { handleError } from '$lib/utils/handle-error';
import { queryClient } from '$lib/query-client';
import { createQuery } from '@tanstack/svelte-query';

export const snapshotKeys = {
  byRepository: (id: string) => ['snapshots', id] as const,
};

export const useSnapshots = (repositoryId: string) =>
  createQuery(
    () => ({
      queryKey: snapshotKeys.byRepository(repositoryId),
      queryFn: () =>
        getSnapshots(repositoryId).then(({ snapshots }) =>
          snapshots.toSorted((a, b) => b.time.localeCompare(a.time)),
        ),
    }),
    () => queryClient,
  );

export const useRemoveSnapshot = (repositoryId: string) => {

  return (snapshotId: string) => {
    queryClient.setQueryData(
      snapshotKeys.byRepository(repositoryId),
      (data: SnapshotDto[] | undefined) => {
        return data ? data.filter((entry) => entry.id !== snapshotId) : void 0;
      },
    );
  };
};

export const handleGetSnapshots = async (repositoryId: string) => {
  try {
    return await sdk.getSnapshots(repositoryId);
  } catch (error) {
    handleError(error, 'Failed to load snapshots');
    throw error;
  }
};

export const handleRestoreSnapshot = async (
  repositoryId: string,
  snapshotId: string,
  options: RepositorySnapshotRestoreRequestDto,
) => {
  return await sdk.restoreSnapshot(repositoryId, snapshotId, options);
};

export const handleForgetSnapshot = async (
  repositoryId: string,
  snapshotId: string,
) => {
  toastManager.info('Deleting snapshot', {
    id: snapshotId,
    closable: false,
    timeout: null!,
  });

  try {
    await sdk.forgetSnapshot(repositoryId, snapshotId);
    toastManager.success('Deleted snapshot');
  } catch (error) {
    handleError(error, 'Failed to delete snapshot');
    throw error;
  } finally {
    (toastManager as never as { remove(target: { id: string }): void }).remove({
      id: snapshotId,
    });
  }
};

export const handleGetSnapshotListing = async (
  id: string,
  snapshotId: string,
  path?: string,
) => {
  try {
    return await sdk.getSnapshotListing(id, snapshotId, { path });
  } catch (error) {
    handleError(error, 'Failed to load directory listing');
    throw error;
  }
};
