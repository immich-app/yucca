import { createLocalBackend, type CreateLocalBackendRequestDto, defaults, getBackends } from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { createQuery } from '@tanstack/svelte-query';

export const backendKeys = {
  all: ['backends'] as const,
};

export const useBackends = () =>
  createQuery(
    () => ({
      queryKey: backendKeys.all,
      queryFn: () => getBackends().then(({ backends }) => backends),
    }),
    () => queryClient,
  );

/* eslint-disable unicorn/prefer-global-this */
export function handleYuccaLogin() {
  const loginUrl = new URL('api/yucca/auth/oidc/login', defaults.baseUrl);
  loginUrl.searchParams.set('next', window.location.href);
  window.location.href = loginUrl.href;
}
/* eslint-enable unicorn/prefer-global-this */

export const handleCreateLocalBackend = async (dto: CreateLocalBackendRequestDto) => {
  try {
    const result = await createLocalBackend(dto);
    await queryClient.invalidateQueries({ queryKey: backendKeys.all });
    return result;
  } catch (error) {
    handleError(error, 'Failed to create local backend');
    throw error;
  }
};
