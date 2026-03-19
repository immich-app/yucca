<script lang="ts">
  import {
    Alert,
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
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import { type LocalRepositoryDto } from "$lib/fetch-client";
  import { DateTime } from "luxon";
  import {
    handleForgetSnapshot,
    useRemoveSnapshot,
    useSnapshots,
  } from "$lib/services/snapshot.service";
  import RestoreSnapshotModal from "./RestoreSnapshotModal.svelte";
  import { mdiDeleteOutline, mdiRestore } from "@mdi/js";

  interface Props {
    repository: LocalRepositoryDto;
    onClose: () => void;
  }

  let { repository, onClose }: Props = $props();

  const query = useSnapshots(repository.id);
  const removeSnapshot = useRemoveSnapshot(repository.id);
  let deleting = $state(false);

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
      removeSnapshot(id);
    } finally {
      deleting = false;
    }
  };
</script>

<Modal title={`Snapshots for ${repository.name}`} {onClose}>
  <ModalBody>
    {#if query.isLoading}
      <LoadingSpinner />
    {:else if query.isError}
      <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
    {:else if query.isSuccess}
      <Table>
        <TableHeader>
          <TableHeading>Snapshot</TableHeading>
          <TableHeading>Created</TableHeading>
          <TableHeading></TableHeading>
        </TableHeader>

        <TableBody>
          {#each query.data as snapshot (snapshot.id)}
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
    {/if}
  </ModalBody>
</Modal>
