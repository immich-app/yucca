import { getIntegrations, type IntegrationsResponseDto } from '$lib/fetch-client';
import { SocketEvent } from '$lib/events';
import { queryClient } from '$lib/query-client';
import { createQuery } from '@tanstack/svelte-query';

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
  onIntegrationUpdate(event: SocketEvent<{ integrations: IntegrationsResponseDto }>) {
    queryClient.setQueryData(integrationsKeys.all, event.data.integrations);
  },
});
