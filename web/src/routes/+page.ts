import { protectedRoute } from 'yucca-sdk';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
  // todo: rewrite using stores, etc.

  try {
    await protectedRoute();
    return { isLoggedIn: true };
  } catch {
    return {
      isLoggedIn: false,
    };
  }
};
