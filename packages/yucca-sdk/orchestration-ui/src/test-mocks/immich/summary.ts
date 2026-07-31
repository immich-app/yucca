import {
  useIntegrationEventHandler,
  useIntegrations,
} from '$lib/services/integrations.service';
import {
  useRepositories,
  useRepositoryEventHandler,
} from '$lib/services/repository.service';

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
