<script lang="ts">
  import {
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
  import type { LocalRepositoryDto, RunDto } from "$lib/fetch-client";
  import { onMount } from "svelte";
  import ViewLogModal from "./ViewLogModal.svelte";
  import { handleGetRunHistory } from "$lib/services/runHistory.service";

  interface Props {
    repository: LocalRepositoryDto;
    onClose: () => void;
  }

  let { repository, onClose }: Props = $props();

  let runs: RunDto[] | undefined = $state();

  onMount(async () => {
    const result = await handleGetRunHistory(repository.id);
    runs = result.runs.toSorted((a, b) => b.start.localeCompare(a.start));
  });
</script>

<Modal title={`Run History for ${repository.name}`} size="giant" {onClose}>
  <ModalBody>
    {#if runs}
      <Table>
        <TableHeader>
          <TableHeading>Start</TableHeading>
          <TableHeading>End</TableHeading>
          <TableHeading>Status</TableHeading>
          <TableHeading></TableHeading>
        </TableHeader>

        <TableBody>
          {#each runs as run (run.id)}
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
    {:else}
      <LoadingSpinner />
    {/if}
  </ModalBody>
</Modal>
