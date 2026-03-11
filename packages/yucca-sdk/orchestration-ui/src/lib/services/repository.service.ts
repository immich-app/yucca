import { sdk } from '$lib';
import {
  updateRepository,
  type RepositoryUpdateRequestDto,
} from '$lib/fetch-client';
import { handleError } from '$lib/utils/handle-error';

export const handleUpdateRepository = async (
  id: string,
  dto: RepositoryUpdateRequestDto,
  local = false,
) => {
  try {
    // eslint-disable-next-line unicorn/prefer-ternary
    if (local) {
      await sdk.updateRepository(id, dto);
    } else {
      await updateRepository(id, dto);
    }
  } catch (error) {
    handleError(error, 'Failed to update repository');
  }
};
