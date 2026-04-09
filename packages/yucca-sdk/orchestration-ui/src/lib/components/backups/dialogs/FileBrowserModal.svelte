<script lang="ts">
  import {
    HStack,
    IconButton,
    LoadingSpinner,
    Modal,
    ModalBody,
    Stack,
    Text,
  } from "@immich/ui";
  import { mdiFolderOpen, mdiPlus } from "@mdi/js";
  import type { FilesystemListingResponseDto } from "$lib/fetch-client";
  import { handleGetFileListing } from "$lib/services/filesystem.service";
  import { onMount } from "svelte";

  interface Props {
    onSelect: (path: string) => void;
    onClose: () => void;
  }

  const { onSelect, onClose }: Props = $props();

  let listing: FilesystemListingResponseDto | undefined = $state();

  async function open(path?: string) {
    listing = undefined;
    listing = await handleGetFileListing(path);
  }

  onMount(() => open());
</script>

{#if listing}
  <Modal title={listing.path} {onClose}>
    <ModalBody>
      <Stack gap={1}>
        <HStack gap={2} class="items-center py-2 px-4">
          <IconButton
            icon={mdiFolderOpen}
            aria-label="Go up directory"
            size="tiny"
            onclick={() => open(listing!.parent)}
          />
          <Text size="small" class="grow">..</Text>
        </HStack>

        {#each listing.items as item (item.path)}
          <HStack gap={2} class="items-center py-2 px-4">
            {#if item.isDirectory}
              <IconButton
                icon={mdiFolderOpen}
                aria-label="Open folder"
                size="tiny"
                onclick={() => open(item.path)}
              />
            {:else}
              <div class="w-7"></div>
            {/if}
            <Text size="small" class="grow"
              >{item.path.split(/\\|\//).pop()}</Text
            >
            <IconButton
              icon={mdiPlus}
              aria-label="Add"
              size="tiny"
              onclick={() => {
                onSelect(item.path);
                onClose();
              }}
            />
          </HStack>
        {/each}
      </Stack>
    </ModalBody>
  </Modal>
{:else}
  <Modal title="Loading..." {onClose}>
    <ModalBody>
      <LoadingSpinner />
    </ModalBody>
  </Modal>
{/if}
