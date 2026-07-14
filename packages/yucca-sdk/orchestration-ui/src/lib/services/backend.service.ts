import CreateLocalBackend from '$lib/components/backends/dialogs/CreateLocalBackendModal.svelte';
import OAuthDeviceFlow from '$lib/components/backends/dialogs/OAuthDeviceFlowModal.svelte';
import ReconfigureRepositoryBackendModal from '$lib/components/backups/dialogs/ReconfigureRepositoryBackendModal.svelte';
import { SocketEvent } from '$lib/events';
import {
  createLocalBackend,
  getBackends,
  oidcDeviceFlow,
  type BackendDto,
  type CreateLocalBackendRequestDto,
  type LocalRepositoryDto,
  type RepositoryBackendDto,
} from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { modalManager, type ActionItem } from '@immich/ui';
import { mdiLogin } from '@mdi/js';
import { createMutation, createQuery } from '@tanstack/svelte-query';

export const backendKeys = {
  all: ['backends'] as const,
  deviceFlow: (uid: string) => ['deviceFlow', uid] as const,
};

export const useBackends = () =>
  createQuery(
    () => ({
      queryKey: backendKeys.all,
      queryFn: () => getBackends().then(({ backends }) => backends),
    }),
    () => queryClient,
  );

export const useDeviceFlow = (uid: string) =>
  createQuery(
    () => ({
      queryKey: backendKeys.deviceFlow(uid),
      queryFn: async () => {
        const response = await oidcDeviceFlow();
        window.open(response.verificationUri, '_blank');
        return response;
      },
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
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

const startYuccaLogin = async (onCreate?: (backendId: string) => void) => {
  void modalManager.show(OAuthDeviceFlow, {
    onCreate,
  });
};

export const useYuccaLogin = () =>
  createMutation(
    () => ({
      mutationFn: (onCreate?: (backendId: string) => void) =>
        startYuccaLogin(onCreate),
      onError: (error) => handleError(error, 'Failed to start login'),
    }),
    () => queryClient,
  );

export const handleSetupLocalStorage = (
  onCreate?: (backendId: string) => void,
) => {
  void modalManager.show(CreateLocalBackend, { onCreate });
};

export const useCreateLocalBackend = () =>
  createMutation(
    () => ({
      mutationFn: (dto: CreateLocalBackendRequestDto) =>
        createLocalBackend(dto),
      onError: (error) => handleError(error, 'Failed to create local backend'),
    }),
    () => queryClient,
  );

export const handleReconfigureRepositoryBackend = async (
  repository: LocalRepositoryDto,
) => {
  await modalManager.show(ReconfigureRepositoryBackendModal, {
    repository,
  });
};

export const handleRemoveRepositoryBackend = (
  _backend: BackendDto,
  _repositoryBackend: RepositoryBackendDto,
) => {
  alert('TODO: implement me when multi-repository-backend support is added');
};

export const getBackendActions = (
  repository: LocalRepositoryDto | undefined,
  backend: BackendDto,
  repositoryBackend?: RepositoryBackendDto & { primary?: boolean },
  onLogin?: () => void,
) => {
  const LoginAgain: ActionItem = {
    icon: mdiLogin,
    title: 'Login again',
    onAction: () => onLogin?.(),
    $if: () => backend.type === 'yucca' && !backend.isOnline,
  };

  const Reconfigure: ActionItem = {
    icon: mdiLogin,
    title: 'Reconfigure',
    onAction: () => void handleReconfigureRepositoryBackend(repository!),
    $if: () =>
      repositoryBackend
        ? backend.isOnline &&
          !repositoryBackend.online &&
          repositoryBackend.primary === true
        : false,
  };

  const Remove: ActionItem = {
    icon: mdiLogin,
    title: 'Remove',
    onAction: () =>
      void handleRemoveRepositoryBackend(backend, repositoryBackend!),
    $if: () =>
      repositoryBackend
        ? backend.isOnline &&
          !repositoryBackend.online &&
          repositoryBackend.primary === false
        : false,
  };

  return { LoginAgain, Reconfigure, Remove };
};
