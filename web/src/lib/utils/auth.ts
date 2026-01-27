import { user } from '$lib/stores/user.store';
import { get } from 'svelte/store';
import { protectedRoute } from 'yucca-sdk';

export const auth = async (fetch: typeof globalThis.fetch) => {
  const currentUser = get(user);
  if (!currentUser) {
    try {
      await protectedRoute({
        fetch,
      });

      user.set(true);
    } catch {
      user.set(false);
    }
  }
};
