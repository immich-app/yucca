<script lang="ts">
  import {
    Button,
    Field,
    IconButton,
    Input,
    Modal,
    ModalBody,
    modalManager,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableRow,
    toastManager,
  } from "@immich/ui";
  import {
    addRepositoryPath,
    removeRepositoryPath,
    updateRepository,
    type LocalRepositoryDto,
  } from "$lib/fetch-client";
  import { mdiMinus } from "@mdi/js";
  import FileBrowserModal from "./FileBrowserModal.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import type { SocketEvent } from "$lib/events";

  interface Props {
    repository: LocalRepositoryDto & { configuration: object };
    onClose: () => void;
  }

  let { repository: initialRepository, onClose }: Props = $props();

  // svelte-ignore state_referenced_locally
  let repository = $state(initialRepository);

  // svelte-ignore state_referenced_locally
  let name = $state(repository.name);
  let updating = $state(false);

  const onUpdate = async () => {
    try {
      await updateRepository(repository.id, { name });
      toastManager.success("Updated repository");
    } catch (error) {
      toastManager.danger(`Failed to update repository: ${error}`);
    }
  };

  const onRepositoryUpdate = (
    event: SocketEvent<{
      repositoryId: string;
      repository: Partial<LocalRepositoryDto>;
    }>,
  ) => {
    if (event.data.repositoryId === repository.id) {
      repository = {
        ...repository,
        ...event.data.repository,
      };
    }
  };

  const removePath = async (path: string) => {
    await removeRepositoryPath(repository.id, { path });
  };

  const addPath = () => {
    modalManager.show(FileBrowserModal, {
      async onSelect(path) {
        await addRepositoryPath(repository.id, { path });
      },
    });
  };
</script>

<OnEvents {onRepositoryUpdate} />

<Modal title={`Configure ${repository.name}`} size="large" {onClose}>
  <ModalBody>
    <Stack gap={4}>
      <Field label="Name">
        <Input bind:value={name} />
      </Field>
      <Button disabled={updating} onclick={onUpdate}>Update</Button>
    </Stack>
    <Stack gap={2}>
      <Table spacing="tiny">
        <TableHeader>
          <TableCell>Backup Path</TableCell>
          <TableCell class="w-16"></TableCell>
        </TableHeader>

        <TableBody>
          {#each repository.configuration.paths as path (path)}
            <TableRow>
              <TableCell>{path}</TableCell>
              <TableCell class="w-16 flex flex-col items-end px-2">
                <IconButton
                  icon={mdiMinus}
                  aria-label="Remove"
                  size="small"
                  color="danger"
                  onclick={async () => removePath(path)}
                />
              </TableCell>
            </TableRow>
          {/each}

          {#if repository.configuration.paths.length === 0}
            <TableRow>
              <TableCell>No paths configured yet.</TableCell>
              <TableCell class="w-16"></TableCell>
            </TableRow>
          {/if}

          <TableRow>
            <TableCell class="flex flex-col items-center">
              <Button onclick={addPath}>Add path</Button>
            </TableCell>
            <TableCell class="w-16"></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Stack>
  </ModalBody>
</Modal>
