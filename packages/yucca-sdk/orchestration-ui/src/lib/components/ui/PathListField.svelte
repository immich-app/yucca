<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import type { FilesystemListingResponseDto } from "$lib/fetch-client";
  import {
    Button,
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
      <StackListItem>
        <Text class="grow truncate" title={path}>{path}</Text>

        {#snippet trailing()}
          <IconButton
            icon={mdiClose}
            aria-label="Remove"
            size="tiny"
            variant="ghost"
            onclick={() => paths.delete(path)}
          />
        {/snippet}
      </StackListItem>
    {/each}
  {:else if empty}
    <StackListItem>
      <Text color="secondary">{@render empty()}</Text>
    </StackListItem>
  {/if}

  <StackListItem>
    <Button size="small" variant="ghost" onclick={openPicker}>
      {paths.size > 0 ? addLabel : manageLabel}
    </Button>
  </StackListItem>
</StackList>
