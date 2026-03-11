<script lang="ts">
  import {
    Button,
    FormModal,
    HStack,
    IconButton,
    Input,
    modalManager,
    Stack,
    Text,
    Field,
  } from "@immich/ui";
  import { type LocalRepositoryDto } from "$lib/fetch-client";
  import { mdiClose } from "@mdi/js";
  import FileBrowserModal from "./FileBrowserModal.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import type { SocketEvent } from "$lib/events";
  import { handleUpdateRepository } from "$lib/services/repository.service";
  import { SvelteSet } from "svelte/reactivity";

  interface Props {
    repository: LocalRepositoryDto;
    onClose: () => void;
  }

  let { repository, onClose }: Props = $props();

  let name = $state(repository.name);
  let paths = new SvelteSet(repository.configuration?.paths ?? []);

  const onRepositoryUpdate = (
    event: SocketEvent<{
      repositoryId: string;
      repository: Partial<LocalRepositoryDto>;
    }>,
  ) => {
    const { repository, repositoryId } = event.data;

    if (repositoryId === repository.id) {
      if (repository.name) {
        name = repository.name;
      }

      if (repository.configuration) {
        paths.clear();

        for (const path of repository.configuration!.paths) {
          paths.add(path);
        }
      }
    }
  };

  const onSubmit = async () => {
    await handleUpdateRepository(
      repository.id,
      { name, paths: [...paths] },
      typeof repository.configuration === "object",
    );

    onClose();
  };
</script>

<OnEvents {onRepositoryUpdate} />

<FormModal title={`Configure ${name}`} size="large" {onSubmit} {onClose}>
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
            class="items-center py-2 px-4 bg-gray-100 rounded-md border border-gray-200"
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
  </Stack>
</FormModal>
