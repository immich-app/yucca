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
    toastManager,
  } from "@immich/ui";
  import {
    forgetSnapshot,
    getSnapshots,
    type LocalRepositoryDto,
    type SnapshotDto,
  } from "$lib/fetch-client";
  import { onMount } from "svelte";
  import { DateTime } from "luxon";

  interface Props {
    repository: LocalRepositoryDto;
    onClose: () => void;
  }

  let { repository, onClose }: Props = $props();

  let snapshots: SnapshotDto[] | undefined = $state();

  onMount(() =>
    getSnapshots(repository.id).then(
      (result) =>
        (snapshots = result.snapshots.toSorted((a, b) =>
          b.time.localeCompare(a.time),
        )),
    ),
  );

  const deleteSnapshot = (id: string) => async () => {
    toastManager.info("Deleting snapshot", {
      id,
      closable: false,
      timeout: null!,
    });

    try {
      await forgetSnapshot(repository.id, id);

      toastManager.success("Deleted snapshot");
      snapshots = snapshots?.filter((snapshot) => snapshot.id !== id);
    } catch (error) {
      toastManager.danger(`Failed to delete snapshot: ${error}`);
    } finally {
      (
        toastManager as never as { remove(target: { id: string }): void }
      ).remove({ id });
    }
  };
</script>

<Modal title={`Snapshots for ${repository.id}`} size="giant" {onClose}>
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
                  onclick={deleteSnapshot(snapshot.id)}>Delete</Button
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
