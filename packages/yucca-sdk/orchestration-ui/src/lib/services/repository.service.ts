import { sdk } from '$lib';
import {
  updateRepository,
  type RepositoryCreateRequestDto,
  type RepositoryUpdateRequestDto,
} from '$lib/fetch-client';
import { handleError } from '$lib/utils/handle-error';
import { toastManager } from '@immich/ui';

export const handleCheckImportRepository = async (
  id: string,
  backendId: string,
) => {
  try {
    return await sdk.checkImportRepository(id, backendId);
  } catch (error) {
    handleError(error, 'Failed to check repository');
    throw error;
  }
};

export const handleImportRepository = async (id: string, backendId: string) => {
  try {
    return await sdk.importRepository(id, backendId);
  } catch (error) {
    handleError(error, 'Failed to import repository');
    throw error;
  }
};

export const handleCreateRepository = async (
  dto: RepositoryCreateRequestDto,
) => {
  try {
    return await sdk.createRepository(dto);
  } catch (error) {
    handleError(error, 'Failed to create repository');
    throw error;
  }
};

export const handleCreateBackup = async (id: string) => {
  try {
    toastManager.info('Started backup');
    return await sdk.createBackup(id);
  } catch (error) {
    handleError(error, 'Failed to start backup');
    throw error;
  }
};

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
    throw error;
  }
};
