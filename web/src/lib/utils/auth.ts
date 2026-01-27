import { protectedRoute } from 'yucca-sdk';

export const auth = async (fetch: typeof globalThis.fetch) => {
  try {
    await protectedRoute({
      fetch,
    });

    return true;
  } catch {
    return false;
  }
};
