<script lang="ts">
  import {
    Button,
    IconButton,
    Modal,
    ModalBody,
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHeader,
    TableHeading,
    TableRow,
  } from "@immich/ui";
  import { mdiMinus } from "@mdi/js";
  import {
    addRepositoryPath,
    removeRepositoryPath,
    type RepositoryConfigurationDto,
  } from "$lib/fetch-client";
  import FileBrowser from "./FileBrowser.svelte";

  interface Props {
    id: string;
    configuration: RepositoryConfigurationDto;
    onClose: () => void;
    onUpdate: (configuration: RepositoryConfigurationDto) => void;
  }

  let { id, configuration, onClose, onUpdate }: Props = $props();

  let showFileBrowser = $state(false);
</script>

<Modal title={id} {onClose}>
  <ModalBody>
    <Table>
      <TableHeader>
        <TableHeading>Backing up</TableHeading>
      </TableHeader>

      <TableBody>
        {#each configuration.paths as path (path)}
          <TableRow>
            <TableCell>{path}</TableCell>
            <TableCell class="w-16">
              <IconButton
                icon={mdiMinus}
                aria-label="Remove"
                size="small"
                onclick={async () => {
                  await removeRepositoryPath(id, { path });
                  const updated = {
                    ...configuration,
                    paths: configuration.paths.filter((x) => x !== path),
                  };
                  onUpdate(updated);
                }}
              />
            </TableCell>
          </TableRow>
        {/each}
      </TableBody>

      <TableFooter>
        <Button onclick={() => (showFileBrowser = true)}>Add</Button>
      </TableFooter>
    </Table>
  </ModalBody>
</Modal>

{#if showFileBrowser}
  <FileBrowser
    onClose={() => (showFileBrowser = false)}
    onSelect={async (path) => {
      await addRepositoryPath(id, { path });
      const updated = {
        ...configuration,
        paths: [...configuration.paths, path],
      };
      onUpdate(updated);
      showFileBrowser = false;
    }}
  />
{/if}