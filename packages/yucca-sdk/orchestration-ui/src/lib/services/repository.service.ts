import { sdk } from '$lib';
import ViewLogModal from '$lib/components/backups/dialogs/ViewLogModal.svelte';
import { SocketEvent } from '$lib/events';
import {
  deleteRepository,
  inspectRepositories,
  updateRepository,
  type InspectedLocalRepositoryDto,
  type LocalRepositoryDto,
  type RepositoryCreateRequestDto,
  type RepositoryUpdateRequestDto,
} from '$lib/fetch-client';
import { getProvider } from '$lib/providers';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { modalManager, toastManager } from '@immich/ui';
import { createQuery } from '@tanstack/svelte-query';

export const repositoryKeys = {
  all: ['repositories'] as const,
  inspectAll: ['repositories', 'inspect'] as const,
};

export const useRepositories = (initialData?: LocalRepositoryDto[]) =>
  createQuery(
    () => ({
      queryKey: repositoryKeys.all,
      queryFn: () =>
        getProvider()
          .getRepositories()
          .then(({ repositories }) => repositories),
      initialData,
    }),
    () => queryClient,
  );

export const useInspectRepositories = (
  initialData?: InspectedLocalRepositoryDto[],
) =>
  createQuery(
    () => ({
      queryKey: repositoryKeys.inspectAll,
      queryFn: () =>
        inspectRepositories().then(({ repositories }) => repositories),
      initialData,
    }),
    () => queryClient,
  );

export const useRepositoryEventHandler = () => {
  return {
    onRepositoryCreate(event: SocketEvent<{ repository: LocalRepositoryDto }>) {
      queryClient.setQueryData(
        repositoryKeys.all,
        (data: LocalRepositoryDto[] | undefined) => {
          return data
            ? [
                ...data.filter(
                  (entry) => entry.id !== event.data.repository.id,
                ),
                event.data.repository,
              ]
            : void 0;
        },
      );
    },
    onRepositoryUpdate(
      event: SocketEvent<{
        repositoryId: string;
        repository: Partial<LocalRepositoryDto>;
      }>,
    ) {
      queryClient.setQueryData(
        repositoryKeys.all,
        (data: LocalRepositoryDto[] | undefined) => {
          return data
            ? data.map((entry) =>
                entry.id === event.data.repositoryId
                  ? { ...entry, ...event.data.repository }
                  : entry,
              )
            : void 0;
        },
      );
    },
    onRepositoryDelete() {
      queryClient
        .invalidateQueries({
          queryKey: repositoryKeys.all,
        })
        .catch(() => void 0);
    },
  };
};

export const handleCheckImportRepository = async (
  id: string,
  backendId: string,
) => {
  try {
    return await sdk.checkImportRepository(id, backendId);
  } catch (error) {
    handleError(error, 'Failed to check repository');
    throw error;
  }
};

export const handleImportRepository = async (id: string, backendId: string) => {
  try {
    return await sdk.importRepository(id, backendId);
  } catch (error) {
    handleError(error, 'Failed to import repository');
    throw error;
  }
};

export const handleCreateRepository = async (
  dto: RepositoryCreateRequestDto,
) => {
  try {
    return await sdk.createRepository(dto);
  } catch (error) {
    handleError(error, 'Failed to create repository');
    throw error;
  }
};

export const handleCreateBackup = async (id: string) => {
  try {
    toastManager.info('Started backup');
    const response = await sdk.createBackup(id);
    void modalManager.open(ViewLogModal, { logId: response.logId });
    return response;
  } catch (error) {
    handleError(error, 'Failed to start backup');
    throw error;
  }
};

export const handlePruneRepository = async (id: string) => {
  try {
    toastManager.info('Cleaning up old backups');
    const response = await sdk.pruneRepository(id);
    void modalManager.open(ViewLogModal, { logId: response.logId });
    return response;
  } catch (error) {
    handleError(error, 'Failed to start cleanup');
    throw error;
  }
};

export const handleUpdateRepository = async (
  id: string,
  dto: RepositoryUpdateRequestDto,
  local = false,
) => {
  try {
    // eslint-disable-next-line unicorn/prefer-ternary
    if (local) {
      await sdk.updateRepository(id, dto);
    } else {
      await updateRepository(id, dto);
    }
  } catch (error) {
    handleError(error, 'Failed to update repository');
    throw error;
  }
};

export const handleRemoveRepository = async (id: string, local = false) => {
  try {
    // eslint-disable-next-line unicorn/prefer-ternary
    if (local) {
      await sdk.deleteRepository(id);
    } else {
      await deleteRepository(id);
    }
  } catch (error) {
    handleError(error, 'Failed to delete repository');
    throw error;
  }
};
