import ImmichConfigureBackup from '$lib/components/integrations/immich/ImmichConfigureBackup.svelte';
import BackupsRecoveryKeyModal from '$lib/components/onboarding/dialogs/BackupsRecoveryKeyModal.svelte';
import { modalManager, type ActionItem } from '@immich/ui';
import { mdiCloudUploadOutline, mdiCogOutline, mdiKeyOutline } from '@mdi/js';
import {
  useIntegrationEventHandler,
  useIntegrations,
} from './integrations.service';
import {
  handleCreateBackup,
  useRepositories,
  useRepositoryEventHandler,
} from './repository.service';

export const getBackupPageActions = (repositoryId?: string) => {
  const Configure: ActionItem = {
    title: 'Configure',
    icon: mdiCogOutline,
    onAction: () => modalManager.show(ImmichConfigureBackup, {}),
  };

  const ViewRecoveryKey: ActionItem = {
    title: 'View recovery key',
    icon: mdiKeyOutline,
    onAction: () => void modalManager.show(BackupsRecoveryKeyModal, {}),
  };

  const BackUpNow: ActionItem = {
    title: 'Back up now',
    icon: mdiCloudUploadOutline,
    onAction: () => void handleCreateBackup(repositoryId!),
    $if: () => typeof repositoryId === 'string',
  };

  return { Configure, ViewRecoveryKey, BackUpNow };
};

export const useImmichBackupSummary = () => {
  const integrations = useIntegrations();
  const repositories = useRepositories();

  const { onIntegrationUpdate } = useIntegrationEventHandler();
  const { onRepositoryCreate, onRepositoryUpdate, onRepositoryDelete } =
    useRepositoryEventHandler();

  const getRepository = () => {
    const integration = integrations.data?.immichIntegration;

    return integration
      ? repositories.data?.find(
          (repository) => repository.id === integration.id,
        )
      : undefined;
  };

  return {
    events: {
      onIntegrationUpdate,
      onRepositoryCreate,
      onRepositoryUpdate,
      onRepositoryDelete,
    },

    get isLoading() {
      return integrations.isLoading || repositories.isLoading;
    },

    get configured() {
      return Boolean(getRepository());
    },

    get lastBackup() {
      return getRepository()?.metrics.lastBackup ?? undefined;
    },

    get failed() {
      const metrics = getRepository()?.metrics;

      return Boolean(
        metrics?.lastBackup &&
        metrics.lastBackup !== metrics.lastSuccessfulBackup,
      );
    },

    get sizeBytes() {
      const repository = getRepository();

      return repository?.meter?.sizeBytes ?? repository?.metrics.sizeBytes;
    },
  };
};
