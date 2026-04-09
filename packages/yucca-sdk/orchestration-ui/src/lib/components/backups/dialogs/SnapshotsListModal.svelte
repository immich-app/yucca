<script lang="ts">
  import {
    Button,
    IconButton,
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
  import { type LocalRepositoryDto, type SnapshotDto } from "$lib/fetch-client";
  import { onMount } from "svelte";
  import { DateTime } from "luxon";
  import {
    handleForgetSnapshot,
    handleGetSnapshots,
  } from "$lib/services/snapshot.service";
  import RestoreSnapshotModal from "./RestoreSnapshotModal.svelte";
  import { mdiDeleteOutline, mdiRestore } from "@mdi/js";

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

  const restoreSnapshot = (id: string) => {
    onClose();

    modalManager.open(RestoreSnapshotModal, {
      repository: repository.id,
      snapshot: id,
    });
  };

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

<Modal title={`Snapshots for ${repository.name}`} {onClose}>
  <ModalBody>
    {#if snapshots}
      <Table>
        <TableHeader>
          <TableHeading>Snapshot</TableHeading>
          <TableHeading>Created</TableHeading>
          <TableHeading></TableHeading>
        </TableHeader>

        <TableBody>
          {#each snapshots as snapshot (snapshot.id)}
            <TableRow>
              <TableCell><code class="text-xs">{snapshot.id.slice(0, 12)}</code></TableCell>
              <TableCell>{DateTime.fromISO(snapshot.time).toRelative()}</TableCell>
              <TableCell class="flex gap-1 justify-end">
                <IconButton
                  icon={mdiRestore}
                  aria-label="Restore"
                  size="small"
                  disabled={deleting}
                  onclick={() => restoreSnapshot(snapshot.id)}
                />
                <IconButton
                  icon={mdiDeleteOutline}
                  aria-label="Delete"
                  size="small"
                  color="danger"
                  disabled={deleting}
                  onclick={() => deleteSnapshot(snapshot.id)}
                />
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
