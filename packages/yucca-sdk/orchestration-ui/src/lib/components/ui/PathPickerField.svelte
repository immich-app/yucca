<script lang="ts">
  import PathPickerModal from "./PathPickerModal.svelte";
  import type { FilesystemListingResponseDto } from "$lib/fetch-client";
  import {
    Heading,
    HStack,
    IconButton,
    Input,
    modalManager,
    Stack,
    Text,
  } from "@immich/ui";
  import { mdiFolder } from "@mdi/js";
  import type { Snippet } from "svelte";

  type Props = {
    value: string;
    title?: Snippet;
    description?: Snippet;
    placeholder?: string;
    pickerTitle?: string;
    pickerDescription?: string;
    foldersOnly?: boolean;
    handleGetListing?: (path?: string) => Promise<FilesystemListingResponseDto>;
  };

  let {
    value = $bindable(""),
    title,
    description,
    placeholder = "/path/to/folder",
    pickerTitle = "Choose folder",
    pickerDescription,
    foldersOnly = true,
    handleGetListing,
  }: Props = $props();

  const browse = () =>
    modalManager.open(PathPickerModal, {
      title: pickerTitle,
      description: pickerDescription,
      foldersOnly,
      single: true,
      handleGetListing,
      onSubmit: ([path]) => {
        if (path) {
          value = path;
        }
      },
    });
</script>

<Stack gap={2}>
  {#if title || description}
    <Stack gap={0}>
      {#if title}
        <Heading class="px-1" size="tiny">{@render title()}</Heading>
      {/if}
      {#if description}
        <Text color="secondary" size="small">{@render description()}</Text>
      {/if}
    </Stack>
  {/if}
  <HStack gap={2}>
    <Input bind:value {placeholder} />
    <IconButton
      icon={mdiFolder}
      aria-label="Choose folder"
      variant="outline"
      color="secondary"
      onclick={browse}
    />
  </HStack>
</Stack>
