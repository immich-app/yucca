<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import type { FilesystemListingResponseDto } from "$lib/fetch-client";
  import {
    Button,
    HStack,
    IconButton,
    modalManager,
    Text,
  } from "@immich/ui";
  import { mdiClose } from "@mdi/js";
  import type { Snippet } from "svelte";
  import type { SvelteSet } from "svelte/reactivity";
  import PathPickerModal from "./PathPickerModal.svelte";

  type Props = {
    paths: SvelteSet<string>;
    label?: Snippet;
    empty?: Snippet;
    addLabel?: string;
    manageLabel?: string;
    pickerTitle?: string;
    pickerDescription?: string;
    foldersOnly?: boolean;
    handleGetListing?: (path?: string) => Promise<FilesystemListingResponseDto>;
  };

  let {
    paths,
    label,
    empty,
    addLabel = "Manage paths",
    manageLabel = "Manage paths",
    pickerTitle = "Choose paths",
    pickerDescription,
    foldersOnly = false,
    handleGetListing,
  }: Props = $props();

  const openPicker = () =>
    modalManager.show(PathPickerModal, {
      title: pickerTitle,
      description: pickerDescription,
      foldersOnly,
      initial: [...paths],
      handleGetListing,
      onSubmit: (next) => {
        paths.clear();
        for (const path of next) paths.add(path);
      },
    });
</script>

<StackList>
  {#snippet title()}
    {@render label?.()}
  {/snippet}

  {#if paths.size > 0}
    {#each [...paths] as path (path)}
      <HStack gap={2} class="px-4 py-3">
        <Text class="grow truncate" title={path}>{path}</Text>
        <IconButton
          icon={mdiClose}
          aria-label="Remove"
          size="tiny"
          variant="ghost"
          onclick={() => paths.delete(path)}
        />
      </HStack>
    {/each}
  {:else if empty}
    <HStack class="px-4 py-3">
      <Text color="secondary">{@render empty()}</Text>
    </HStack>
  {/if}

  <HStack class="px-4 py-2">
    <Button size="small" variant="ghost" onclick={openPicker}>
      {paths.size > 0 ? addLabel : manageLabel}
    </Button>
  </HStack>
</StackList>
