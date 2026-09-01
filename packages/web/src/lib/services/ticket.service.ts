import { handleError } from '$lib/utils/handle-error';
import { deleteRepository, disableWorm, getTicket, type TicketDto } from '@futo-org/backups-api-client';
import { queryClient } from '@futo-org/backups-orchestrator-ui';
import { createMutation, createQuery } from '@tanstack/svelte-query';

export const ticketKeys = {
  ticket: (id: string) => ['ticket', id] as const,
};

export const useTicket = (id: string) =>
  createQuery(
    () => ({
      queryKey: ticketKeys.ticket(id),
      queryFn: () => getTicket(id),
    }),
    () => queryClient,
  );

export const useTicketAction = () =>
  createMutation(
    () => ({
      mutationFn: async (ticket: TicketDto) => {
        switch (ticket.action) {
          case 'repository.delete': {
            await deleteRepository(ticket.repositoryId, ticket.id);
            break;
          }
          case 'repository.disable-worm': {
            await disableWorm(ticket.repositoryId, ticket.id);
            break;
          }
        }
      },
      onError: (error) => handleError(error, 'Failed perform action'),
    }),
    () => queryClient,
  );
