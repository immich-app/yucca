<script lang="ts">
  import PathListField from "$lib/components/ui/PathListField.svelte";
  import PathPickerField from "$lib/components/ui/PathPickerField.svelte";
  import type { RepositorySnapshotRestoreRequestDto } from "$lib/fetch-client";
  import {
    handleGetSnapshotListing,
    useRestoreSnapshot,
  } from "$lib/services/snapshot.service";
  import {
    FormModal,
    Heading,
    HStack,
    modalManager,
    Stack,
    Switch,
    Text,
  } from "@immich/ui";
  import { SvelteSet } from "svelte/reactivity";
  import ViewStatusModal from "./ViewStatusModal.svelte";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    repository: string;
    snapshot: string;
    onClose: () => void;
  };

  let { repository, snapshot, onClose }: Props = $props();

  let inPlace = $state(true);
  let target = $state("");
  let include = new SvelteSet<string>();

  const mutation = useRestoreSnapshot();

  const onSubmit = () => {
    const dto: RepositorySnapshotRestoreRequestDto = {
      include: [...include],
    };

    if (!inPlace) {
      dto.target = target;
    }

    mutation.mutate(
      { repositoryId: repository, snapshotId: snapshot, options: dto },
      {
        onSuccess: ({ logId }) => {
          onClose();

          modalManager.open(ViewStatusModal, {
            logId,
          });
        },
      },
    );
  };
</script>

<FormModal
  title={$t`Restore Backup`}
  submitText={$t`Restore`}
  disabled={(!inPlace && !target.trim()) || mutation.isPending}
  {onSubmit}
  {onClose}
>
  <Stack gap={5}>
    <PathListField
      paths={include}
      addLabel={$t`Add more files`}
      manageLabel={$t`Select files instead`}
      pickerTitle={$t`Files to restore`}
      pickerDescription={$t`Pick the files and folders to restore. Leave empty to restore everything.`}
      handleGetListing={(path) =>
        handleGetSnapshotListing(repository, snapshot, path)}
    >
      {#snippet label()}{$t`Files to restore`}{/snippet}
      {#snippet empty()}{$t`Restoring all files and folders.`}{/snippet}
    </PathListField>

    <Stack gap={4}>
      <Heading class="px-1" size="tiny">{$t`Options`}</Heading>

      <HStack gap={4}>
        <Stack gap={0}>
          <Text>{$t`In-place restore`}</Text>
          <Text color="secondary" size="small">
            {$t`Restore files to where they were originally.`}
          </Text>
        </Stack>
        <Switch bind:checked={inPlace} />
      </HStack>

      {#if !inPlace}
        <PathPickerField
          bind:value={target}
          placeholder="/path/to/restore/into"
          pickerTitle={$t`Choose target folder`}
          pickerDescription={$t`Pick the folder to restore files into.`}
        >
          {#snippet title()}{$t`Target`}{/snippet}
          {#snippet description()}
            {$t`Where do you want this backup restored to?`}
          {/snippet}
        </PathPickerField>
      {/if}
    </Stack>
  </Stack>
</FormModal>
