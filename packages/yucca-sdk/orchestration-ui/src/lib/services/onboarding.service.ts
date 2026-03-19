import { sdk } from '$lib';
import type { ImportRecoveryKeyRequest } from '$lib/fetch-client';
import { handleError } from '$lib/utils/handle-error';

export const handleOnboardingStatus = async () => {
  try {
    return await sdk.onboardingStatus();
  } catch (error) {
    handleError(error, 'Failed to load onboarding status');
    throw error;
  }
};

export const handleCurrentRecoveryKey = async () => {
  try {
    return await sdk.currentRecoveryKey();
  } catch (error) {
    handleError(error, 'Failed to load recovery key');
    throw error;
  }
};

export const handleConfirmRecoveryKey = async () => {
  try {
    await sdk.confirmRecoveryKey();
  } catch (error) {
    handleError(error, 'Failed to confirm recovery key');
    throw error;
  }
};

export const handleImportRecoveryKey = async (
  dto: ImportRecoveryKeyRequest,
) => {
  try {
    await sdk.importRecoveryKey(dto);
  } catch (error) {
    handleError(error, 'Failed to import recovery key');
    throw error;
  }
};
