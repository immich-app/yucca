import { SocketEvent } from '$lib/events';
import {
  configureImmichIntegration,
  getIntegrations,
  type ConfigureImmichIntegrationRequestDto,
  type IntegrationsResponseDto,
} from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { createMutation, createQuery } from '@tanstack/svelte-query';

export const integrationsKeys = {
  all: ['integrations'] as const,
};

export const useIntegrations = () =>
  createQuery(
    () => ({
      queryKey: integrationsKeys.all,
      queryFn: () => getIntegrations(),
    }),
    () => queryClient,
  );

export const useIntegrationEventHandler = () => ({
  onIntegrationUpdate(
    event: SocketEvent<{ integrations: IntegrationsResponseDto }>,
  ) {
    queryClient.setQueryData(integrationsKeys.all, event.data.integrations);
  },
});

export const useConfigureImmichIntegration = () =>
  createMutation(
    () => ({
      mutationFn: (dto: ConfigureImmichIntegrationRequestDto) =>
        configureImmichIntegration(dto),
      onError: (error) => handleError(error, 'Failed to save backup settings'),
    }),
    () => queryClient,
  );

export const useConfigureImmichDefaults = () =>
  createMutation(
    () => ({
      mutationFn: async () => {
        const { immichState } = await getIntegrations();
        if (!immichState) {
          throw new Error('No Immich instance detected.');
        }

        await configureImmichIntegration({
          name: 'Immich',
          worm: false,
          cron: '0 3 * * *',
          dataFolders: immichState.dataFolders,
          backupConfiguration: true,
          libraries: 'all',
        });
      },
      onError: (error) => handleError(error, 'Failed to create backup'),
    }),
    () => queryClient,
  );
