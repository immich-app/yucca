<script lang="ts">
  import type { FilesystemListingResponseDto } from "$lib/fetch-client";
  import { FocusGroup } from "$lib/utils/focus";
  import {
    Button,
    Heading,
    HStack,
    IconButton,
    modalManager,
    Stack,
    Text,
  } from "@immich/ui";
  import { mdiClose } from "@mdi/js";
  import type { Snippet } from "svelte";
  import type { SvelteSet } from "svelte/reactivity";
  import { t } from "svelte-i18n-lingui";
  import PathPickerModal from "./PathPickerModal.svelte";
  import StackList from "./StackList.svelte";
  import StackListItem from "./StackListItem.svelte";

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
    addLabel = $t`Manage paths`,
    manageLabel = $t`Manage paths`,
    pickerTitle = $t`Choose paths`,
    pickerDescription,
    foldersOnly = false,
    handleGetListing,
  }: Props = $props();

  const id = $props.id();
  const removeButtons = new FocusGroup(`${id}-remove`);
  const manageButton = new FocusGroup(`${id}-manage`);

  const remove = (path: string, index: number) => {
    paths.delete(path);
    void removeButtons.focusAt(index, manageButton);
  };

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

<Stack>
  <Heading size="tiny">{@render label?.()}</Heading>

  {#if paths.size > 0}
    <StackList>
      {#each [...paths] as path, index (path)}
        <StackListItem>
          <Text class="grow truncate" title={path}>{path}</Text>

          {#snippet trailing()}
            <IconButton
              icon={mdiClose}
              aria-label={$t({ message: "Remove {path}", values: { path } })}
              size="tiny"
              variant="ghost"
              {...removeButtons.attributes()}
              onclick={() => remove(path, index)}
            />
          {/snippet}
        </StackListItem>
      {/each}
    </StackList>
  {:else if empty}
    <HStack>
      <Text color="secondary">{@render empty()}</Text>
    </HStack>
  {/if}

  <Button
    class="w-fit"
    size="small"
    variant="ghost"
    {...manageButton.attributes()}
    onclick={openPicker}
  >
    {paths.size > 0 ? addLabel : manageLabel}
  </Button>
</Stack>
