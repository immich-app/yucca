<script lang="ts">
  import {
    Button,
    IconButton,
    Modal,
    ModalBody,
    modalManager,
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHeader,
    TableHeading,
    TableRow,
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

<Modal title={`Configure ${repository.id}`} size="large" {onClose}>
  <ModalBody>
    <Table>
      <TableHeader>
        <TableHeading>Backing up</TableHeading>
      </TableHeader>

      <TableBody>
        {#each repository.configuration.paths as path (path)}
          <TableRow>
            <TableCell>{path}</TableCell>
            <TableCell class="w-16">
              <IconButton
                icon={mdiMinus}
                aria-label="Remove"
                size="small"
                onclick={async () => removePath(path)}
              />
            </TableCell>
          </TableRow>
        {/each}
      </TableBody>

      <TableFooter>
        <Button onclick={addPath}>Add</Button>
      </TableFooter>
    </Table>
  </ModalBody>
</Modal>
