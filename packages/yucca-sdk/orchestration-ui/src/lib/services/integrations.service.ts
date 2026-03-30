import { getIntegrations } from '$lib/fetch-client';
import { createQuery } from '@tanstack/svelte-query';

export const integrationsKeys = {
  all: ['integrations'] as const,
};

export const useIntegrations = () =>
  createQuery(() => ({
    queryKey: integrationsKeys.all,
    queryFn: () => getIntegrations(),
  }));
