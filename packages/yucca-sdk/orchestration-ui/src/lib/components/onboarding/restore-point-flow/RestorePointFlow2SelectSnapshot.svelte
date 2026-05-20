<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import type {
    InspectedLocalRepositoryDto,
    SnapshotDto,
  } from "$lib/fetch-client";
  import { humanizeBackupPath } from "$lib/utils/format";
  import {
    Button,
    FormatBytes,
    HStack,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
  } from "@immich/ui";
  import RestorePointFlow3ConfirmRestore from "./RestorePointFlow3ConfirmRestore.svelte";

  type Props = {
    onBack: () => void;
    onFinish: () => void;

    repository: InspectedLocalRepositoryDto;
  };

  const { onBack, onFinish, repository }: Props = $props();

  let selectedSnapshot: SnapshotDto | undefined = $state();
</script>

{#if selectedSnapshot}
  <RestorePointFlow3ConfirmRestore
    onBack={() => (selectedSnapshot = undefined)}
    {onFinish}
    {repository}
    snapshot={selectedSnapshot}
  />
{:else}
  <Modal
    title={`Restore from ${repository.name}`}
    size="medium"
    onClose={onBack}
  >
    <ModalBody>
      <StackList>
        {#each repository.snapshots.toSorted((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()) as snapshot (snapshot.id)}
          <HStack gap={2} class="px-4 py-3">
            <Stack gap={0} class="grow min-w-0">
              <HStack
                ><RelativeTime time={snapshot.time} />
                {#if snapshot.summary}
                  <Text size="small" color="secondary">
                    &middot; <FormatBytes bytes={snapshot.summary.totalBytes} />
                  </Text>
                {/if}</HStack
              >
              <Text size="small" color="muted"
                >{[...new Set(snapshot.paths.map(humanizeBackupPath))].join(
                  ", ",
                )}</Text
              >
            </Stack>
            <Button onclick={() => (selectedSnapshot = snapshot)}>
              Restore
            </Button>
          </HStack>
        {/each}
        {#if repository.snapshots.length === 0}
          <Text class="text-center py-6" color="muted">
            No snapshots in this repository.
          </Text>
        {/if}
      </StackList>
    </ModalBody>
    <ModalFooter>
      <HStack>
        <Button variant="ghost" onclick={onBack}>Back</Button>
      </HStack>
    </ModalFooter>
  </Modal>
{/if}
