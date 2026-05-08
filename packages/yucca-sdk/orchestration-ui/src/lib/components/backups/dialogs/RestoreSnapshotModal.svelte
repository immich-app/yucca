<script lang="ts">
  import type { RepositorySnapshotRestoreRequestDto } from "$lib/fetch-client";
  import {
    handleGetSnapshotListing,
    handleRestoreSnapshot,
  } from "$lib/services/snapshot.service";
  import {
    Button,
    Checkbox,
    Field,
    FormModal,
    HStack,
    IconButton,
    Input,
    modalManager,
    Stack,
    Text,
  } from "@immich/ui";
  import { mdiClose, mdiFolder } from "@mdi/js";
  import { SvelteSet } from "svelte/reactivity";
  import FileBrowserModal from "./FileBrowserModal.svelte";
  import ViewLogModal from "./ViewLogModal.svelte";

  interface Props {
    repository: string;
    snapshot: string;
    onClose: () => void;
  }

  let { repository, snapshot, onClose }: Props = $props();

  let inPlace = $state(true);
  let target = $state("");
  let include = new SvelteSet<string>();

  const onSubmit = async () => {
    const dto: RepositorySnapshotRestoreRequestDto = {
      include: [...include],
    };

    if (!inPlace) {
      dto.target = target;
    }

    const { logId } = await handleRestoreSnapshot(repository, snapshot, dto);

    onClose();

    modalManager.open(ViewLogModal, {
      logId,
    });
  };
</script>

<FormModal title="Restore Backup" {onSubmit} {onClose}>
  <Stack gap={4}>
    <Stack>
      <Text size="small">Selected Files</Text>
      {#each include as path (path)}
        <HStack
          gap={2}
          class="items-center py-2 px-4 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700"
        >
          <Text class="grow" size="small">{path}</Text>
          <IconButton
            icon={mdiClose}
            size="tiny"
            color="danger"
            aria-label="Remove"
            onclick={() => include.delete(path)}
          />
        </HStack>
      {/each}

      {#if include.size === 0}
        <Text color="secondary" size="small"
          >Restoring all files and folders.</Text
        >
      {/if}

      <div class="w-fit">
        <Button
          size="small"
          variant="outline"
          onclick={() =>
            modalManager.show(FileBrowserModal, {
              onSelect: (path) => include.add(path),
              handleGetListing: (path) =>
                handleGetSnapshotListing(repository, snapshot, path),
            })}>Add file or folder</Button
        >
      </div>
    </Stack>

    <Field
      label="In-place restore"
      description="Restore files to where they were originally"
    >
      <Checkbox bind:checked={inPlace} />
    </Field>

    {#if !inPlace}
      <Field
        label="Target"
        description="Where do you want this backup restored to?"
      >
        <HStack class="items-end">
          <Input bind:value={target} />
          <IconButton
            icon={mdiFolder}
            aria-label="Select folder"
            onclick={() =>
              modalManager.open(FileBrowserModal, {
                folders: true,
                onSelect: (value) => (target = value),
              })}
          />
        </HStack>
      </Field>
    {/if}
  </Stack>
</FormModal>
