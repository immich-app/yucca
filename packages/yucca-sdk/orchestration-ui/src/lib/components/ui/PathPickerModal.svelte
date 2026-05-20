<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import type { FilesystemListingResponseDto } from "$lib/fetch-client";
  import { handleGetFileListing } from "$lib/services/filesystem.service";
  import {
    Button,
    FormModal,
    Heading,
    HStack,
    Icon,
    IconButton,
    ListButton,
    LoadingSpinner,
    Stack,
    Text,
  } from "@immich/ui";
  import {
    mdiArrowUp,
    mdiClose,
    mdiFileOutline,
    mdiFolderOutline,
    mdiPlus,
  } from "@mdi/js";
  import { onMount } from "svelte";
  import { SvelteSet } from "svelte/reactivity";

  type Props = {
    title: string;
    description?: string;
    initial?: string[];
    foldersOnly?: boolean;
    single?: boolean;
    handleGetListing?: (path?: string) => Promise<FilesystemListingResponseDto>;
    onSubmit: (paths: string[]) => void | Promise<void>;
    onClose: () => void;
  };

  let {
    title,
    description,
    initial = [],
    foldersOnly = false,
    single = false,
    handleGetListing,
    onSubmit,
    onClose,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  const selected = new SvelteSet(initial);
  let listing: FilesystemListingResponseDto | undefined = $state();

  const browse = async (path?: string) => {
    listing = undefined;
    listing = await (handleGetListing ?? handleGetFileListing)(path);
  };

  onMount(() => void browse());

  const sortedItems = $derived(
    listing
      ? [...listing.items].sort(
          (a, b) =>
            Number(b.isDirectory) - Number(a.isDirectory) ||
            a.path.localeCompare(b.path),
        )
      : [],
  );

  let submitting = $state(false);

  const handleSubmit = async () => {
    if (submitting) return;
    submitting = true;
    try {
      await onSubmit([...selected]);
      onClose();
    } finally {
      submitting = false;
    }
  };

  const add = async (path: string) => {
    if (single) {
      if (submitting) return;
      submitting = true;
      try {
        await onSubmit([path]);
        onClose();
      } finally {
        submitting = false;
      }
    } else {
      selected.add(path);
    }
  };
</script>

<FormModal
  {title}
  size="large"
  submitText="Save"
  disabled={submitting}
  onSubmit={handleSubmit}
  {onClose}
>
  <Stack gap={5}>
    {#if description}
      <Text color="secondary">{description}</Text>
    {/if}

    {#if !single}
      {#if selected.size > 0}
        <StackList>
          {#snippet title()}
            Selected paths
          {/snippet}
          {#each [...selected] as path (path)}
            <HStack gap={2} class="items-center px-4 py-3">
              <Text class="grow truncate" title={path}>{path}</Text>
              <IconButton
                icon={mdiClose}
                aria-label="Remove"
                size="tiny"
                variant="ghost"
                onclick={() => selected.delete(path)}
              />
            </HStack>
          {/each}
        </StackList>
      {:else}
        <Stack gap={2}>
          <Heading class="px-1" size="tiny">Selected paths</Heading>
          <Text color="muted" class="text-center py-6">No paths selected</Text>
        </Stack>
      {/if}
    {/if}

    {#if !listing}
      <Stack gap={2}>
        <Heading class="px-1" size="tiny">Browse</Heading>
        <div class="py-6 flex justify-center">
          <LoadingSpinner />
        </div>
      </Stack>
    {:else}
      <StackList>
        {#snippet title()}
          Browse
        {/snippet}

        <HStack gap={2} class="items-center px-4 py-3 bg-subtle">
          <Icon icon={mdiFolderOutline} color="primary" />
          <Text class="grow truncate" title={listing.path}>
            {listing.path}
          </Text>
          {#if listing.parent && listing.parent !== listing.path}
            <IconButton
              icon={mdiArrowUp}
              aria-label="Go up"
              size="tiny"
              variant="ghost"
              onclick={() => browse(listing!.parent)}
            />
          {/if}
        </HStack>

        {#each sortedItems as item (item.path)}
          {#if item.isDirectory || !foldersOnly}
            <HStack gap={2} class="items-center px-2 py-1">
              {#if item.isDirectory}
                <ListButton
                  leadingIcon={mdiFolderOutline}
                  onclick={() => browse(item.path)}
                  class="flex-1 justify-start"
                >
                  {item.path.split(/[\\/]/).pop()}
                </ListButton>
              {:else}
                <HStack gap={2} class="items-center grow px-2 py-2">
                  <Icon icon={mdiFileOutline} color="secondary" />
                  <Text
                    class="grow truncate"
                    color="secondary"
                    title={item.path}
                  >
                    {item.path.split(/[\\/]/).pop()}
                  </Text>
                </HStack>
              {/if}
              <IconButton
                icon={mdiPlus}
                aria-label={single ? "Select" : "Add"}
                size="tiny"
                variant="ghost"
                disabled={!single && selected.has(item.path)}
                onclick={() => add(item.path)}
              />
            </HStack>
          {/if}
        {/each}

        {#if sortedItems.filter((item) => item.isDirectory || !foldersOnly).length === 0}
          {#if foldersOnly}
            <Stack class="items-center px-4 py-6">
              <Button variant="outline" onclick={() => add(listing!.path)}>
                Use this folder
              </Button>
            </Stack>
          {:else}
            <Text color="muted" class="text-center py-6">
              This folder is empty
            </Text>
          {/if}
        {/if}
      </StackList>
    {/if}
  </Stack>
</FormModal>
