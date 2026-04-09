import { sdk } from '$lib';
import { handleError } from '$lib/utils/handle-error';

export const handleGetRunHistory = async (id: string) => {
  try {
    return await sdk.getRunHistory(id);
  } catch (error) {
    handleError(error, 'Failed to load run history');
    throw error;
  }
};
