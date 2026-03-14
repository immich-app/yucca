import { sdk } from '$lib';
import { toastManager } from '@immich/ui';
import { handleError } from '$lib/utils/handle-error';
import type { RepositorySnapshotRestoreRequestDto } from '$lib/fetch-client';

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
