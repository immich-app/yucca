import {
  createSession,
  defaults,
  type DeviceFlowEventDto,
} from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { createMutation } from '@tanstack/svelte-query';

export type DeviceFlowKind = 'oidc' | 'session';

export const startDeviceFlow = (
  kind: DeviceFlowKind,
  onEvent: (event: DeviceFlowEventDto) => void,
) => {
  const source = new EventSource(
    `${defaults.baseUrl.replace(/\/$/, '')}/api/yucca/auth/${kind}/device`,
    { withCredentials: true },
  );

  source.addEventListener('message', (event) => {
    onEvent(JSON.parse(event.data) as DeviceFlowEventDto);
  });

  source.addEventListener('error', () => {
    onEvent({ type: 'FAILURE', reason: 'UNKNOWN' });
    source.close();
  });

  return () => source.close();
};

export const useCreateSession = () =>
  createMutation(
    () => ({
      mutationFn: (token: string) => createSession({ token }),
      onError: (error) => handleError(error, 'Failed to log in'),
    }),
    () => queryClient,
  );
