<script lang="ts">
  import {
    Alert,
    Button,
    LoadingSpinner,
    Modal,
    ModalBody,
    modalManager,
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableHeading,
    TableRow,
  } from "@immich/ui";
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import ViewLogModal from "./ViewLogModal.svelte";
  import { useRunHistory } from "$lib/services/runHistory.service";

  interface Props {
    repository: LocalRepositoryDto;
    onClose: () => void;
  }

  let { repository, onClose }: Props = $props();

  // svelte-ignore state_referenced_locally
  const query = useRunHistory(repository.id);
</script>

<Modal title={`Run History for ${repository.name}`} size="giant" {onClose}>
  <ModalBody>
    {#if query.isLoading}
      <LoadingSpinner />
    {:else if query.isError}
      <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
    {:else if query.isSuccess}
      <Table>
        <TableHeader>
          <TableHeading>Start</TableHeading>
          <TableHeading>End</TableHeading>
          <TableHeading>Status</TableHeading>
          <TableHeading></TableHeading>
        </TableHeader>

        <TableBody>
          {#each query.data as run (run.id)}
            <TableRow>
              <TableCell>{run.start}</TableCell>
              <TableCell>{run.end}</TableCell>
              <TableCell>{run.status}</TableCell>
              <TableCell>
                <Button
                  size="tiny"
                  onclick={() =>
                    modalManager.show(ViewLogModal, { logId: run.id })}
                  >View Log</Button
                >
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    {/if}
  </ModalBody>
</Modal>
