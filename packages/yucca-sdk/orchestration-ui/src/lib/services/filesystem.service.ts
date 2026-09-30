import { sdk } from '$lib';
import { handleError } from '$lib/utils/handle-error';
import { gt } from 'svelte-i18n-lingui';

export const handleGetFileListing = async (path?: string) => {
  try {
    return await sdk.getFileListing({ path });
  } catch (error) {
    handleError(error, gt`Failed to load directory listing`);
    throw error;
  }
};
