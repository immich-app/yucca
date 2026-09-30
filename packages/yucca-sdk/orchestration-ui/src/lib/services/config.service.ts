import {
  getConfig,
  updateConfig,
  type BandwidthDto,
  type ConfigUpdateRequestDto,
} from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { createMutation, createQuery } from '@tanstack/svelte-query';
import { gt } from 'svelte-i18n-lingui';

export const configKeys = {
  all: ['config'] as const,
};

const bytesPerSecPerMbps = 125_000;
export const defaultQuietHoursStart = '22:00';
export const defaultQuietHoursEnd = '06:00';

export type BandwidthForm = {
  mbps?: number;
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
    mbps: bytesPerSec ? bytesPerSec / bytesPerSecPerMbps : undefined,
    quiet: Boolean(quietHours),
    quietStart,
    quietEnd,
  };
};

export const toBytesPerSec = (mbps = 0) =>
  Math.max(0, Math.ceil(mbps)) * bytesPerSecPerMbps;

export const toBandwidthDto = ({
  mbps,
  quiet,
  quietStart,
  quietEnd,
}: BandwidthForm): BandwidthDto => {
  const bytesPerSec = toBytesPerSec(mbps);

  return {
    bytesPerSec,
    quietHours: bytesPerSec && quiet ? `${quietStart}-${quietEnd}` : undefined,
  };
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
      onError: (error) => handleError(error, gt`Failed to save settings`),
    }),
    () => queryClient,
  );
