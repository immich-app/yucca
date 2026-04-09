<script lang="ts">
  import {
    Button,
    LoadingSpinner,
    Modal,
    ModalBody,
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableHeading,
    TableRow,
  } from "@immich/ui";
  import type { LocalRepositoryDto, SnapshotDto } from "$lib/fetch-client";
  import { onMount } from "svelte";
  import { DateTime } from "luxon";
  import {
    handleForgetSnapshot,
    handleGetSnapshots,
  } from "$lib/services/snapshot.service";

  interface Props {
    repository: LocalRepositoryDto;
    onClose: () => void;
  }

  let { repository, onClose }: Props = $props();

  let snapshots: SnapshotDto[] | undefined = $state();
  let deleting = $state(false);

  onMount(async () => {
    const result = await handleGetSnapshots(repository.id);
    snapshots = result.snapshots.toSorted((a, b) =>
      b.time.localeCompare(a.time),
    );
  });

  const deleteSnapshot = async (id: string) => {
    deleting = true;

    try {
      await handleForgetSnapshot(repository.id, id);
      snapshots = snapshots?.filter((snapshot) => snapshot.id !== id);
    } finally {
      deleting = false;
    }
  };
</script>

<Modal title={`Snapshots for ${repository.name}`} size="giant" {onClose}>
  <ModalBody>
    {#if snapshots}
      <Table>
        <TableHeader>
          <TableHeading>ID</TableHeading>
          <TableHeading>Created</TableHeading>
          <TableHeading></TableHeading>
        </TableHeader>

        <TableBody>
          {#each snapshots as snapshot (snapshot.id)}
            <TableRow>
              <TableCell>{snapshot.id}</TableCell>
              <TableCell
                >{DateTime.fromISO(snapshot.time).toRelative()}</TableCell
              >
              <TableCell>
                <Button
                  size="tiny"
                  color="danger"
                  disabled={deleting}
                  onclick={() => deleteSnapshot(snapshot.id)}>Delete</Button
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
