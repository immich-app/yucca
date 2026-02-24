<script lang="ts">
  import {
    IconButton,
    Modal,
    ModalBody,
    Table,
    TableBody,
    TableCell,
    TableRow,
  } from "@immich/ui";
  import { mdiChevronRight, mdiChevronUp, mdiPlus } from "@mdi/js";
  import {
    type FilesystemListingResponseDto,
    getFileListing,
  } from "$lib/fetch-client";

  interface Props {
    onSelect: (path: string) => void;
    onClose: () => void;
  }

  const { onSelect, onClose }: Props = $props();

  let listing: FilesystemListingResponseDto | undefined = $state();

  async function open(path?: string) {
    listing = await getFileListing({ path });
  }

  open();
</script>

{#if listing}
  <Modal title={listing.path} {onClose}>
    <ModalBody>
      <Table spacing="tiny">
        <TableBody>
          <TableRow>
            <TableCell class="text-left">...</TableCell>
            <TableCell class="w-16">
              <IconButton
                icon={mdiChevronUp}
                aria-label="Go up directory"
                onclick={() => open(listing!.parent)}
                size="small"
              />
            </TableCell>
            <TableCell class="w-16" />
          </TableRow>

          {#each listing.items as item (item.path)}
            <TableRow>
              <TableCell class="text-left"
                >{item.path.split(/\\|\//).pop()}</TableCell
              >
              <TableCell class="w-16">
                {#if item.isDirectory}
                  <IconButton
                    icon={mdiChevronRight}
                    aria-label="Open folder"
                    onclick={() => open(item.path)}
                    size="small"
                  />
                {/if}
              </TableCell>
              <TableCell class="w-16">
                <IconButton
                  icon={mdiPlus}
                  aria-label="Add"
                  size="small"
                  onclick={() => onSelect(item.path)}
                />
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    </ModalBody>
  </Modal>
{/if}
