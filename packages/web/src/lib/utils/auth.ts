import { getAuth } from 'yucca-api-client';

export const auth = async (fetch: typeof globalThis.fetch) => {
  try {
    return await getAuth({
      fetch,
    });
  } catch {
    return null;
  }
};
