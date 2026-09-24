import {
  getConfig,
  updateConfig,
  type BandwidthDto,
  type ConfigUpdateRequestDto,
} from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { createMutation, createQuery } from '@tanstack/svelte-query';

export const configKeys = {
  all: ['config'] as const,
};

export const unlimitedBandwidth = '0';
export const defaultQuietHoursStart = '22:00';
export const defaultQuietHoursEnd = '06:00';

export type BandwidthForm = {
  speed: string;
  quiet: boolean;
  quietStart: string;
  quietEnd: string;
};

export const toBandwidthForm = ({
  bytesPerSec,
  quietHours,
}: BandwidthDto): BandwidthForm => {
  const [quietStart = defaultQuietHoursStart, quietEnd = defaultQuietHoursEnd] =
    quietHours?.split('-') ?? [];

  return {
    speed: String(bytesPerSec),
    quiet: Boolean(quietHours),
    quietStart,
    quietEnd,
  };
};

export const toBandwidthDto = ({
  speed,
  quiet,
  quietStart,
  quietEnd,
}: BandwidthForm): BandwidthDto => ({
  bytesPerSec: Number(speed),
  quietHours:
    speed !== unlimitedBandwidth && quiet
      ? `${quietStart}-${quietEnd}`
      : undefined,
});

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
