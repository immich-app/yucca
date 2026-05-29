import { sdk } from '$lib';
import ConfigureRepositoryModal from '$lib/components/backups/dialogs/ConfigureRepositoryModal.svelte';
import ImportRepositoryModal from '$lib/components/backups/dialogs/ImportRepositoryModal.svelte';
import ViewLogModal from '$lib/components/backups/dialogs/ViewLogModal.svelte';
import MetricsHistoryModal from '$lib/components/backups/metrics-history/MetricsHistoryModal.svelte';
import RunHistoryModal from '$lib/components/backups/run-history/RunHistoryModal.svelte';
import SnapshotsListModal from '$lib/components/backups/snapshots-list/SnapshotsListModal.svelte';
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
import { modalManager, toastManager, type ActionItem } from '@immich/ui';
import {
  mdiCog,
  mdiFormatListBulletedType,
  mdiHistory,
  mdiImport,
  mdiListStatus,
  mdiPlay,
} from '@mdi/js';
import { createMutation, createQuery } from '@tanstack/svelte-query';

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

export const useCreateRepository = () =>
  createMutation(
    () => ({
      mutationFn: (dto: RepositoryCreateRequestDto) =>
        sdk.createRepository(dto),
      onSuccess: () =>
        void queryClient.invalidateQueries({ queryKey: repositoryKeys.all }),
      onError: (error) => handleError(error, 'Failed to create repository'),
    }),
    () => queryClient,
  );

export const useImportRepository = () =>
  createMutation(
    () => ({
      mutationFn: ({ id, backendId }: { id: string; backendId: string }) =>
        sdk.importRepository(id, backendId),
      onSuccess: () =>
        void queryClient.invalidateQueries({ queryKey: repositoryKeys.all }),
      onError: (error) => handleError(error, 'Failed to import repository'),
    }),
    () => queryClient,
  );

export const useUpdateRepository = () =>
  createMutation(
    () => ({
      mutationFn: ({
        id,
        dto,
        local = false,
      }: {
        id: string;
        dto: RepositoryUpdateRequestDto;
        local?: boolean;
      }) => (local ? sdk.updateRepository(id, dto) : updateRepository(id, dto)),
      onSuccess: () =>
        void queryClient.invalidateQueries({ queryKey: repositoryKeys.all }),
      onError: (error) => handleError(error, 'Failed to update repository'),
    }),
    () => queryClient,
  );

export const useRemoveRepository = () =>
  createMutation(
    () => ({
      mutationFn: ({ id, local = false }: { id: string; local?: boolean }) =>
        local ? sdk.deleteRepository(id) : deleteRepository(id),
      onSuccess: () =>
        void queryClient.invalidateQueries({ queryKey: repositoryKeys.all }),
      onError: (error) => handleError(error, 'Failed to delete repository'),
    }),
    () => queryClient,
  );

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

export const getRepositoryActions = (repository: LocalRepositoryDto) => {
  const online = Boolean(
    repository.configuration && repository.backends?.primary.online,
  );
  const configured = Boolean(repository.configuration);

  const BackupNow: ActionItem = {
    title: 'Back up now',
    icon: mdiPlay,
    onAction: () => void handleCreateBackup(repository.id),
    $if: () => online,
  };

  const Snapshots: ActionItem = {
    title: 'Snapshots',
    icon: mdiFormatListBulletedType,
    onAction: () => void modalManager.open(SnapshotsListModal, { repository }),
    $if: () => online,
  };

  const History: ActionItem = {
    title: 'Logs',
    icon: mdiListStatus,
    onAction: () => void modalManager.open(RunHistoryModal, { repository }),
    $if: () => configured,
  };

  const Configure: ActionItem = {
    title: 'Configure',
    icon: mdiCog,
    onAction: () =>
      void modalManager.open(ConfigureRepositoryModal, {
        repository: { ...repository, configuration: repository.configuration! },
      }),
    $if: () => configured,
  };

  const Import: ActionItem = {
    title: 'Import',
    icon: mdiImport,
    onAction: () => void modalManager.open(ImportRepositoryModal, { repository }),
    $if: () => Boolean(repository.backends && !repository.configuration),
  };

  const MetricsHistory: ActionItem = {
    title: 'Metrics history',
    icon: mdiHistory,
    onAction: () => void modalManager.open(MetricsHistoryModal, { repository }),
    $if: () => !repository.backends,
  };

  return { BackupNow, Snapshots, History, Configure, Import, MetricsHistory };
};
