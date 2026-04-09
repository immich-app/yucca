<script lang="ts">
  import {
    Button,
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
  import {
    getRunHistory,
    type LocalRepositoryDto,
    type RunDto,
  } from "$lib/fetch-client";
  import { onMount } from "svelte";
  import ViewLogModal from "./ViewLogModal.svelte";

  // TODO: needs UI refactoring

  interface Props {
    repository: LocalRepositoryDto;
    onClose: () => void;
  }

  let { repository, onClose }: Props = $props();

  let runs: RunDto[] = $state([]);

  onMount(() =>
    getRunHistory(repository.id).then(
      (result) =>
        (runs = result.runs.toSorted((a, b) => b.start.localeCompare(a.start))),
    ),
  );

  const onViewLog = (logId: string) => () => {
    modalManager.show(ViewLogModal, {
      logId,
    });
  };
</script>

<Modal title={`Run History for ${repository.name}`} size="giant" {onClose}>
  <ModalBody>
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
              <Button size="tiny" onclick={onViewLog(run.id)}>View Log</Button>
            </TableCell>
          </TableRow>
        {/each}
      </TableBody>
    </Table>
  </ModalBody>
</Modal>
