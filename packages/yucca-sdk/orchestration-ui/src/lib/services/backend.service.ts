import CreateLocalBackend from '$lib/components/backends/CreateLocalBackend.svelte';
import OAuthDeviceFlow from '$lib/components/backends/OAuthDeviceFlow.svelte';
import { SocketEvent } from '$lib/events';
import {
  createLocalBackend,
  getBackends,
  oidcDeviceFlow,
  type BackendDto,
  type CreateLocalBackendRequestDto,
} from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { modalManager, type ActionItem } from '@immich/ui';
import { mdiLogin } from '@mdi/js';
import { createQuery } from '@tanstack/svelte-query';

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

export const handleYuccaLogin = async (
  onCreate?: (backendId: string) => void,
) => {
  try {
    const response = await oidcDeviceFlow();
    void modalManager.show(OAuthDeviceFlow, {
      ...response,
      onCreate,
    });
    window.open(response.verificationUri, '_blank');
  } catch (error) {
    handleError(error, 'Failed to start login');
    throw error;
  }
};

export const handleSetupLocalStorage = (
  onCreate?: (backendId: string) => void,
) => {
  void modalManager.show(CreateLocalBackend, { onCreate });
};

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

export const getBackendActions = (backend: BackendDto) => {
  const LoginAgain: ActionItem = {
    icon: mdiLogin,
    title: 'Login again',
    onAction: () => void handleYuccaLogin(),
    $if: () => backend.type === 'yucca' && !backend.isOnline,
  };

  return { LoginAgain };
};
