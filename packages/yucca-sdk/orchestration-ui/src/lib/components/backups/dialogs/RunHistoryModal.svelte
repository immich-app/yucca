<script lang="ts">
  import {
    Modal,
    ModalBody,
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableHeading,
    TableRow,
  } from "@immich/ui";
  import { type LocalRepositoryDto, type RunDto } from "$lib/fetch-client";
  import { BaseProvider, getProvider } from "$lib/providers";
  import { onMount } from "svelte";

  interface Props {
    repository: LocalRepositoryDto;
    provider: BaseProvider;
    onClose: () => void;
  }

  let { repository, provider, onClose }: Props = $props();

  let runs: RunDto[] = $state([]);

  onMount(() =>
    provider
      .getRunHistory(repository.id)
      .then(
        (result) =>
          (runs = result.runs.toSorted((a, b) =>
            b.start.localeCompare(a.start),
          )),
      ),
  );
</script>

<Modal title={`Run History for ${repository.id}`} size="giant" {onClose}>
  <ModalBody>
    <Table>
      <TableHeader>
        <TableHeading>Start</TableHeading>
        <TableHeading>End</TableHeading>
        <TableHeading>Status</TableHeading>
        <!-- <TableHeading></TableHeading> -->
      </TableHeader>

      <TableBody>
        {#each runs as run (run.id)}
          <TableRow>
            <TableCell>{run.start}</TableCell>
            <TableCell>{run.end}</TableCell>
            <TableCell>{run.status}</TableCell>
            <!-- <TableCell>
              <Button>View Log</Button>
            </TableCell> -->
          </TableRow>
        {/each}
      </TableBody>
    </Table>
  </ModalBody>
</Modal>
