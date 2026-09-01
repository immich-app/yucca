import { sdk } from '$lib';
import ConfigureRepositoryModal from '$lib/components/backups/dialogs/ConfigureRepositoryModal.svelte';
import ImportRepositoryModal from '$lib/components/backups/dialogs/ImportRepositoryModal.svelte';
import ViewStatusModal from '$lib/components/backups/dialogs/ViewStatusModal.svelte';
import MetricsHistoryModal from '$lib/components/backups/metrics-history/MetricsHistoryModal.svelte';
import RunHistoryModal from '$lib/components/backups/run-history/RunHistoryModal.svelte';
import SnapshotsListModal from '$lib/components/backups/snapshots-list/SnapshotsListModal.svelte';
import { SocketEvent } from '$lib/events';
import {
  inspectRepositories,
  reconfigureRepositoryPrimaryBackend,
  updateRepository,
  type InspectedLocalRepositoryDto,
  type LocalRepositoryDto,
  type RepositoryCreateRequestDto,
  type RepositoryUpdateRequestDto,
} from '$lib/fetch-client';
import { getProvider } from '$lib/providers';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { createTicket } from '@futo-org/backups-api-client';
import { modalManager, toastManager, type ActionItem } from '@immich/ui';
import { mdiCog, mdiFormatListBulletedType, mdiHistory, mdiImport, mdiListStatus, mdiPlay, mdiTrashCan } from '@mdi/js';
import { createMutation, createQuery } from '@tanstack/svelte-query';

export const repositoryKeys = {
  all: ['repositories'] as const,
  inspect: (backendId?: string) => ['repositories', 'inspect', backendId] as const,
  checkImport: (id: string, backendId: string) => ['repositories', id, 'check-import', backendId] as const,
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

export const useInspectRepositories = (backendId?: string, initialData?: InspectedLocalRepositoryDto[]) =>
  createQuery(
    () => ({
      queryKey: repositoryKeys.inspect(backendId),
      queryFn: () => inspectRepositories({ backend: backendId }).then(({ repositories }) => repositories),
      initialData,
    }),
    () => queryClient,
  );

export const useRepositoryEventHandler = () => {
  return {
    onRepositoryCreate(event: SocketEvent<{ repository: LocalRepositoryDto }>) {
      queryClient.setQueryData(repositoryKeys.all, (data: LocalRepositoryDto[] | undefined) => {
        return data
          ? [...data.filter((entry) => entry.id !== event.data.repository.id), event.data.repository]
          : void 0;
      });
    },
    onRepositoryUpdate(
      event: SocketEvent<{
        repositoryId: string;
        repository: Partial<LocalRepositoryDto>;
      }>,
    ) {
      queryClient.setQueryData(repositoryKeys.all, (data: LocalRepositoryDto[] | undefined) => {
        return data
          ? data.map((entry) => (entry.id === event.data.repositoryId ? { ...entry, ...event.data.repository } : entry))
          : void 0;
      });
    },
    onRepositoryDelete(event: SocketEvent<{ repositoryId: string }>) {
      queryClient.setQueryData(repositoryKeys.all, (data: LocalRepositoryDto[] | undefined) =>
        data?.filter((entry) => entry.id !== event.data.repositoryId),
      );
    },
  };
};

export const useCheckImportRepository = (id: string, backendId: string) =>
  createQuery(
    () => ({
      queryKey: repositoryKeys.checkImport(id, backendId),
      queryFn: () => sdk.checkImportRepository(id, backendId),
    }),
    () => queryClient,
  );

export const useCreateRepository = () =>
  createMutation(
    () => ({
      mutationFn: (dto: RepositoryCreateRequestDto) => sdk.createRepository(dto),
      onError: (error) => handleError(error, 'Failed to create repository'),
    }),
    () => queryClient,
  );

export const useImportRepository = () =>
  createMutation(
    () => ({
      mutationFn: ({ id, backendId }: { id: string; backendId: string }) => sdk.importRepository(id, backendId),
      onError: (error) => handleError(error, 'Failed to import repository'),
    }),
    () => queryClient,
  );

export const useUpdateRepository = () =>
  createMutation(
    () => ({
      mutationFn: ({ id, dto, local = false }: { id: string; dto: RepositoryUpdateRequestDto; local?: boolean }) =>
        local ? sdk.updateRepository(id, dto) : updateRepository(id, dto),
      onError: (error) => handleError(error, 'Failed to update repository'),
    }),
    () => queryClient,
  );

export const useReconfigureRepositoryPrimaryBackend = () =>
  createMutation(
    () => ({
      mutationFn: ({ id, backendId }: { id: string; backendId: string }) =>
        reconfigureRepositoryPrimaryBackend(id, { backendId }),
      onError: (error) => handleError(error, 'Failed to reconfigure backend'),
    }),
    () => queryClient,
  );

export const handleCreateBackup = async (id: string) => {
  try {
    toastManager.info('Started backup');
    const response = await sdk.createBackup(id);
    void modalManager.open(ViewStatusModal, {
      logId: response.logId,
      onRetry: () => void handleCreateBackup(id),
    });
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
    void modalManager.open(ViewStatusModal, {
      logId: response.logId,
      onRetry: () => void handlePruneRepository(id),
    });
    return response;
  } catch (error) {
    handleError(error, 'Failed to start cleanup');
    throw error;
  }
};

export const handleDeleteRepository = async (repositoryId: string, local?: boolean) => {
  try {
    const action = local ? sdk.createTicket : createTicket;

    const { redirectTo } = await action({
      action: 'repository.delete',
      repositoryId,
    });

    window.open(redirectTo, '_blank');
  } catch (error) {
    handleError(error, 'Failed to start deletion');
    throw error;
  }
};

export const handleDisableWormRepository = async (repositoryId: string, local?: boolean) => {
  try {
    const action = local ? sdk.createTicket : createTicket;

    const { redirectTo } = await action({
      action: 'repository.disable-worm',
      repositoryId,
    });

    window.open(redirectTo, '_blank');
  } catch (error) {
    handleError(error, 'Failed to start disable write-only process');
    throw error;
  }
};

export const getRepositoryActions = (repository: LocalRepositoryDto, local?: boolean) => {
  const online = Boolean(repository.configuration && repository.backends?.primary.online);
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

  const Delete: ActionItem = {
    title: 'Delete repository',
    icon: mdiTrashCan,
    onAction: () => void handleDeleteRepository(repository.id, local),
    $if: () => !repository.backends || repository.backends.primary.type === 'yucca',
  };

  return {
    BackupNow,
    Snapshots,
    History,
    Configure,
    Import,
    MetricsHistory,
    Delete,
  };
};
