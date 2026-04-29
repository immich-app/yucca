import {
  createLocalBackend,
  type BackendDto,
  type CreateLocalBackendRequestDto,
  getBackends,
} from '$lib/fetch-client';
import { SocketEvent } from '$lib/events';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { createQuery } from '@tanstack/svelte-query';
import { oidcDeviceFlow } from '$lib/fetch-client';

export const backendKeys = {
  all: ['backends'] as const,
};

export const useBackends = () =>
  createQuery(
    () => ({
      queryKey: backendKeys.all,
      queryFn: () => getBackends().then(({ backends }) => backends),
    }),
    () => queryClient,
  );

export const useBackendEventHandler = () => {
  return {
    onBackendCreate(event: SocketEvent<{ backend: BackendDto }>) {
      queryClient.setQueryData(
        backendKeys.all,
        (data: BackendDto[] | undefined) => {
          return data
            ? [
                ...data.filter((entry) => entry.id !== event.data.backend.id),
                event.data.backend,
              ]
            : void 0;
        },
      );
    },
  };
};

export async function handleYuccaLogin() {
  const { verificationUri } = await oidcDeviceFlow();
  window.open(verificationUri, '_blank');
}

export const handleCreateLocalBackend = async (
  dto: CreateLocalBackendRequestDto,
) => {
  try {
    return await createLocalBackend(dto);
  } catch (error) {
    handleError(error, 'Failed to create local backend');
    throw error;
  }
};
