<script lang="ts">
  import BackendsList from "$lib/components/backends/BackendsList.svelte";
  import { type LocalRepositoryDto } from "$lib/fetch-client";
  import { options } from "$lib/options";
  import {
    handleRemoveRepository,
    handleUpdateRepository,
  } from "$lib/services/repository.service";
  import {
    Button,
    Field,
    FormModal,
    HStack,
    IconButton,
    Input,
    modalManager,
    Stack,
    Text,
  } from "@immich/ui";
  import { mdiClose } from "@mdi/js";
  import { SvelteSet } from "svelte/reactivity";
  import FileBrowserModal from "./FileBrowserModal.svelte";

  interface Props {
    repository: LocalRepositoryDto;
    onClose: () => void;
  }

  let { repository, onClose }: Props = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(repository.name);
  // svelte-ignore state_referenced_locally
  let paths = new SvelteSet(repository.configuration?.paths ?? []);

  const local = $derived(typeof repository.configuration === "object");

  const onSubmit = async () => {
    await handleUpdateRepository(
      repository.id,
      { name, paths: [...paths] },
      local,
    );

    onClose();
  };

  const onRemove = async () => {
    const confirm = await modalManager.showDialog({
      confirmText: local ? "Remove" : "Delete",
      title: local ? "Remove Repository" : "Delete Repository",
      prompt: local
        ? "Repository will be removed locally."
        : "This repository will be removed.",
    });

    if (!confirm) return;
    onClose();

    await handleRemoveRepository(repository.id, local);
  };

  const { advanced } = options;
</script>

<FormModal
  disabled={name.length === 0}
  title={`Configure ${name}`}
  size="large"
  {onSubmit}
  {onClose}
>
  <Stack gap={4}>
    <Stack gap={2}>
      <Field label="Name">
        <Input bind:value={name} />
      </Field>
    </Stack>

    {#if repository.configuration}
      <Stack gap={1}>
        <Text size="small">Backup Paths</Text>
        {#each paths as path (path)}
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
              onclick={() => paths.delete(path)}
            />
          </HStack>
        {/each}

        {#if paths.size === 0}
          <Text color="secondary" size="small">No paths configured yet.</Text>
        {/if}

        <div class="w-fit">
          <Button
            size="small"
            variant="outline"
            onclick={() =>
              modalManager.show(FileBrowserModal, {
                onSelect: (path) => paths.add(path),
              })}>Add path</Button
          >
        </div>
      </Stack>
    {/if}

    <Button color="danger" onclick={onRemove}>Remove Repository</Button>

    {#if advanced}
      <BackendsList {repository} />
    {/if}
  </Stack>
</FormModal>
