import { defaults, getBackends } from '$lib/fetch-client';
import { createQuery } from '@tanstack/svelte-query';

export const backendKeys = {
  all: ['backends'] as const,
};

export const useBackends = () =>
  createQuery(() => ({
    queryKey: backendKeys.all,
    queryFn: () => getBackends().then(({ backends }) => backends),
  }));

export function handleYuccaLogin() {
  const loginUrl = new URL('/api/auth/oidc/login', defaults.baseUrl);
  loginUrl.searchParams.set('next', window.location.href);
  window.location.href = loginUrl.href;
}
