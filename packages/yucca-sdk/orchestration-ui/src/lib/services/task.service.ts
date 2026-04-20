import { sdk } from '$lib';
import { handleError } from '$lib/utils/handle-error';

export const handleGetRunningTasks = async () => {
  try {
    return await sdk.getRunningTasks();
  } catch (error) {
    handleError(error, 'Failed to load running tasks');
    throw error;
  }
};

export const handleCancelTask = async (parentId: string) => {
  try {
    await sdk.cancelTask(parentId);
  } catch (error) {
    handleError(error, 'Failed to cancel task');
    throw error;
  }
};
