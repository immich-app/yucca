import {
  getConfig,
  updateConfig,
  type ConfigUpdateRequestDto,
} from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { createMutation, createQuery } from '@tanstack/svelte-query';

export const configKeys = {
  all: ['config'] as const,
};

export const useConfig = () =>
  createQuery(
    () => ({
      queryKey: configKeys.all,
      queryFn: () => getConfig(),
    }),
    () => queryClient,
  );

export const useUpdateConfig = () =>
  createMutation(
    () => ({
      mutationFn: (dto: ConfigUpdateRequestDto) => updateConfig(dto),
      onSuccess: (config) => queryClient.setQueryData(configKeys.all, config),
      onError: (error) => handleError(error, 'Failed to save settings'),
    }),
    () => queryClient,
  );
