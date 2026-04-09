import { sdk } from '$lib';
import { handleError } from '$lib/utils/handle-error';

export const handleGetFileListing = async (path?: string) => {
  try {
    return await sdk.getFileListing({ path });
  } catch (error) {
    handleError(error, 'Failed to load directory listing');
    throw error;
  }
};
