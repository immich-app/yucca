<script lang="ts">
  import { page } from '$app/state';
  import { useTicket, useTicketAction } from '$lib/services/ticket.service';
  import { Suspense } from '@futo-org/backups-orchestrator-ui';
  import { Button, FormatBytes, Modal, ModalBody, ModalFooter, ModalHeader, Stack, VStack } from '@immich/ui';

  const ticketId = $derived(page.params.ticketId);

  // svelte-ignore state_referenced_locally
  const query = useTicket(ticketId!);
  const action = useTicketAction();

  const ACTION_STRINGS = {
    'repository.delete': "You're about to irreversible delete this repository.",
    'repository.disable-worm': 'You are about to make the repository writable.',
  };

  const ACTION_CONFIRM_STRINGS = {
    'repository.delete': 'Permanently Delete',
    'repository.disable-worm': 'Disable Write-only',
  };
</script>

<svelte:head><title>Confirm Action &middot; FUTO Backups</title></svelte:head>

<Modal title="Confirm Action">
  <ModalBody>
    <Suspense {query}>
      {#snippet children(ticket)}
        <Stack>
          <h1>{ACTION_STRINGS[ticket.action]}</h1>

          <VStack gap={0}>
            <strong>{ticket.repositoryName}</strong>
            <span>Size: <FormatBytes bytes={ticket.meter?.sizeBytes ?? ticket.metrics.sizeBytes} /></span>
            {#if ticket.metrics.lastSuccessfulBackup}
              <i>Last backed up [time ago]</i>
            {:else}
              <i>Never successfully backed up</i>
            {/if}
          </VStack>
        </Stack>
      {/snippet}
    </Suspense>
  </ModalBody>
  <ModalFooter>
    <div class="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
      <Button color="secondary" shape="round" onclick={window.close} disabled={action.isPending}>Cancel</Button>
      <Button
        color="danger"
        shape="round"
        disabled={!query.isSuccess || action.isPending}
        onclick={() => action.mutateAsync(query.data!).then(window.close)}
        >{ACTION_CONFIRM_STRINGS[query.data?.action!] ?? '...'}</Button
      >
    </div>
  </ModalFooter>
</Modal>
