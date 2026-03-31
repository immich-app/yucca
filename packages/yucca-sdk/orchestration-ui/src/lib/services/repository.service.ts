import { sdk } from '$lib';
import {
  getRepositories,
  updateRepository,
  type LocalRepositoryDto,
  type RepositoryCreateRequestDto,
  type RepositoryUpdateRequestDto,
} from '$lib/fetch-client';
import { SocketEvent } from '$lib/events';
import { handleError } from '$lib/utils/handle-error';
import { queryClient } from '$lib/query-client';
import { toastManager } from '@immich/ui';
import { createQuery } from '@tanstack/svelte-query';

export const repositoryKeys = {
  all: ['repositories'] as const,
};

export const useRepositories = (initialData?: LocalRepositoryDto[]) =>
  createQuery(
    () => ({
      queryKey: repositoryKeys.all,
      queryFn: () => getRepositories().then(({ repositories }) => repositories),
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
    return await sdk.createBackup(id);
  } catch (error) {
    handleError(error, 'Failed to start backup');
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
