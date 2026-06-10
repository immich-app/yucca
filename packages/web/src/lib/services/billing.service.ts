import {
  getBillingStatus,
  getCustomerBillingPortal,
  startSubscription,
  type CustomerBillingStateResponseDto,
} from '@futo-org/backups-api-client';
import { queryClient } from '@futo-org/backups-orchestrator-ui';
import { handleError } from '$lib/utils/handle-error';
import { createMutation, createQuery } from '@tanstack/svelte-query';

export const billingKeys = {
  all: ['billing'] as const,
};

export const useBillingStatus = (
  initialData?: CustomerBillingStateResponseDto,
) =>
  createQuery(
    () => ({
      queryKey: billingKeys.all,
      queryFn: () => getBillingStatus(),
      initialData,
    }),
    () => queryClient,
  );

export const useStartSubscription = () =>
  createMutation(
    () => ({
      mutationFn: () => startSubscription(),
      onError: (error) => handleError(error, 'Failed to start subscription'),
    }),
    () => queryClient,
  );

export const useManageBilling = () =>
  createMutation(
    () => ({
      mutationFn: () => getCustomerBillingPortal(),
      onError: (error) => handleError(error, 'Failed to open billing portal'),
    }),
    () => queryClient,
  );
