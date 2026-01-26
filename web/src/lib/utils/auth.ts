import { user } from '$lib/stores/user.store';
import { get } from 'svelte/store';
import { protectedRoute } from 'yucca-sdk';

export const auth = async () => {
  const currentUser = get(user);

  if (!currentUser) {
    try {
      await protectedRoute();
      user.set(true);
    } catch {
      user.set(false);
    }
  }
};
