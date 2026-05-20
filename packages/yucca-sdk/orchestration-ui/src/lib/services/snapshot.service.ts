import { sdk } from '$lib';
import RestoreSnapshotModal from '$lib/components/backups/dialogs/RestoreSnapshotModal.svelte';
import { SocketEvent } from '$lib/events';
import {
  getSnapshots,
  type RepositorySnapshotRestoreFromPointRequestDto,
  type RepositorySnapshotRestoreRequestDto,
  type RunDto,
  type SnapshotDto,
} from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { modalManager, toastManager, type ActionItem } from '@immich/ui';
import { mdiBackupRestore, mdiDeleteOutline } from '@mdi/js';
import { createMutation, createQuery } from '@tanstack/svelte-query';

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

export const useSnapshotEventHandler = () => {
  return {
    onRunUpdate(
      event: SocketEvent<{
        runId: string;
        repositoryId: string;
        run: Partial<RunDto>;
      }>,
    ) {
      if (event.data.run.status === 'complete') {
        void queryClient.invalidateQueries({
          queryKey: snapshotKeys.byRepository(event.data.repositoryId),
        });
      }
    },
  };
};

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

export const useRestoreSnapshot = () =>
  createMutation(
    () => ({
      mutationFn: ({
        repositoryId,
        snapshotId,
        options,
      }: {
        repositoryId: string;
        snapshotId: string;
        options: RepositorySnapshotRestoreRequestDto;
      }) => sdk.restoreSnapshot(repositoryId, snapshotId, options),
      onError: (error) => handleError(error, 'Failed to start restore'),
    }),
    () => queryClient,
  );

export const handleRestoreFromPoint = async (
  repositoryId: string,
  snapshotId: string,
  backendId: string,
  options: RepositorySnapshotRestoreFromPointRequestDto,
) => {
  return await sdk.restoreFromPoint(
    repositoryId,
    snapshotId,
    backendId,
    options,
  );
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

export const getSnapshotActions = (
  repositoryId: string,
  snapshot: SnapshotDto,
) => {
  const removeSnapshot = useRemoveSnapshot(repositoryId);

  const Restore: ActionItem = {
    title: 'Restore',
    icon: mdiBackupRestore,
    onAction: () =>
      void modalManager.open(RestoreSnapshotModal, {
        repository: repositoryId,
        snapshot: snapshot.id,
      }),
  };

  const Delete: ActionItem = {
    title: 'Delete',
    icon: mdiDeleteOutline,
    color: 'danger',
    onAction: async () => {
      const confirm = await modalManager.showDialog({
        confirmText: 'Delete',
        title: 'Delete Snapshot',
        prompt: 'This snapshot will be permanently removed.',
      });

      if (!confirm) {
        return;
      }

      await handleForgetSnapshot(repositoryId, snapshot.id);
      removeSnapshot(snapshot.id);
    },
  };

  return { Restore, Delete };
};
