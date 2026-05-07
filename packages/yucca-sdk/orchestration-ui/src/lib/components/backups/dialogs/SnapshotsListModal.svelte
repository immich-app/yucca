<script lang="ts">
  import Suspense from "$lib/components/util/Suspense.svelte";
  import { type LocalRepositoryDto } from "$lib/fetch-client";
  import {
    handleForgetSnapshot,
    useRemoveSnapshot,
    useSnapshots,
  } from "$lib/services/snapshot.service";
  import {
    IconButton,
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
  import { mdiDeleteOutline, mdiRestore } from "@mdi/js";
  import { DateTime } from "luxon";
  import RestoreSnapshotModal from "./RestoreSnapshotModal.svelte";

  interface Props {
    repository: LocalRepositoryDto;
    onClose: () => void;
  }

  let { repository, onClose }: Props = $props();

  // svelte-ignore state_referenced_locally
  const query = useSnapshots(repository.id);
  // svelte-ignore state_referenced_locally
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
    <Suspense {query}>
      <Table>
        <TableHeader>
          <TableHeading>Snapshot</TableHeading>
          <TableHeading>Created</TableHeading>
          <TableHeading></TableHeading>
        </TableHeader>

        <TableBody>
          {#each query.data as snapshot (snapshot.id)}
            <TableRow>
              <TableCell
                ><code class="text-xs">{snapshot.id.slice(0, 12)}</code
                ></TableCell
              >
              <TableCell
                >{DateTime.fromISO(snapshot.time).toRelative()}</TableCell
              >
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
    </Suspense>
  </ModalBody>
</Modal>
