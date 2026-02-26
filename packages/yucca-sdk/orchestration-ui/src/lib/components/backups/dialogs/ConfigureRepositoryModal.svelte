<script lang="ts">
  import {
    Button,
    Field,
    IconButton,
    Label,
    Modal,
    ModalBody,
    modalManager,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHeader,
    TableHeading,
    TableRow,
    Text,
  } from "@immich/ui";
  import {
    addRepositoryPath,
    removeRepositoryPath,
    type LocalRepositoryDto,
  } from "$lib/fetch-client";
  import { mdiMinus } from "@mdi/js";
  import FileBrowserModal from "./FileBrowserModal.svelte";

  interface Props {
    repository: LocalRepositoryDto & { configuration: object };
    onClose: () => void;
    onUpdate: (partial: Partial<LocalRepositoryDto>) => void;
  }

  let {
    repository: initialRepository,
    onClose,
    onUpdate: onUpdateParent,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let repository = $state(initialRepository);

  const onUpdate = (partial: Partial<LocalRepositoryDto>) => {
    repository = {
      ...repository,
      ...partial,
    };

    onUpdateParent(repository);
  };

  const removePath = async (path: string) => {
    await removeRepositoryPath(repository.id, { path });

    onUpdate({
      configuration: {
        ...repository.configuration,
        paths: repository.configuration.paths.filter((x) => x !== path),
      },
    });
  };

  const addPath = () => {
    modalManager.show(FileBrowserModal, {
      async onSelect(path) {
        await addRepositoryPath(repository.id, { path });

        onUpdate({
          configuration: {
            ...repository.configuration,
            paths: [
              ...repository.configuration.paths.filter((x) => x !== path),
              path,
            ],
          },
        });
      },
    });
  };
</script>

<Modal title={`Configure ${repository.name}`} size="large" {onClose}>
  <ModalBody>
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
