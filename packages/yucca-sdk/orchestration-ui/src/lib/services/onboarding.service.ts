import { sdk } from '$lib';
import type { ImportRecoveryKeyRequest } from '$lib/fetch-client';
import { queryClient } from '$lib/query-client';
import { handleError } from '$lib/utils/handle-error';
import { createMutation, createQuery } from '@tanstack/svelte-query';
import { gt } from 'svelte-i18n-lingui';

export const recoveryKeyKeys = {
  all: ['recovery-key'] as const,
};

export const useRecoveryKey = () =>
  createQuery(
    () => ({
      queryKey: recoveryKeyKeys.all,
      queryFn: () => sdk.currentRecoveryKey(),
    }),
    () => queryClient,
  );

export const handleOnboardingStatus = async () => {
  try {
    return await sdk.onboardingStatus();
  } catch (error) {
    handleError(error, gt`Failed to load onboarding status`);
    throw error;
  }
};

export const handleCurrentRecoveryKey = async () => {
  try {
    return await sdk.currentRecoveryKey();
  } catch (error) {
    handleError(error, gt`Failed to load recovery key`);
    throw error;
  }
};

export const handleConfirmRecoveryKey = async () => {
  try {
    await sdk.confirmRecoveryKey();
  } catch (error) {
    handleError(error, gt`Failed to confirm recovery key`);
    throw error;
  }
};

export const handleImportRecoveryKey = async (
  dto: ImportRecoveryKeyRequest,
) => {
  try {
    await sdk.importRecoveryKey(dto);
  } catch (error) {
    handleError(error, gt`Failed to import recovery key`);
    throw error;
  }
};

export const handleSkipOnboardingExtraConfig = async () => {
  try {
    await sdk.skipOnboardingExtraConfig();
  } catch (error) {
    handleError(error, gt`Failed to save preferences`);
    throw error;
  }
};

export const useEnableTelemetry = () =>
  createMutation(
    () => ({
      mutationFn: () => sdk.enableTelemetry(),
      onError: (error) => handleError(error, gt`Failed to save preferences`),
    }),
    () => queryClient,
  );

export const useReportError = () =>
  createMutation(
    () => ({
      mutationFn: () => sdk.reportError(),
      onError: (error) => handleError(error, gt`Failed to report error`),
    }),
    () => queryClient,
  );
