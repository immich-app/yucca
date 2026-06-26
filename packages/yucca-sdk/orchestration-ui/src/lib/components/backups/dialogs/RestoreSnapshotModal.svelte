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
  import ViewLogModal from "./ViewLogModal.svelte";

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

          modalManager.open(ViewLogModal, {
            logId,
          });
        },
      },
    );
  };
</script>

<FormModal
  title="Restore Backup"
  submitText="Restore"
  disabled={(!inPlace && !target.trim()) || mutation.isPending}
  {onSubmit}
  {onClose}
>
  <Stack gap={5}>
    <PathListField
      paths={include}
      addLabel="Add more files"
      manageLabel="Select files instead"
      pickerTitle="Files to restore"
      pickerDescription="Pick the files and folders to restore. Leave empty to restore everything."
      handleGetListing={(path) =>
        handleGetSnapshotListing(repository, snapshot, path)}
    >
      {#snippet label()}Files to restore{/snippet}
      {#snippet empty()}Restoring all files and folders.{/snippet}
    </PathListField>

    <Stack gap={4}>
      <Heading class="px-1" size="tiny">Options</Heading>

      <HStack gap={4}>
        <Stack gap={0}>
          <Text>In-place restore</Text>
          <Text color="secondary" size="small">
            Restore files to where they were originally.
          </Text>
        </Stack>
        <Switch bind:checked={inPlace} />
      </HStack>

      {#if !inPlace}
        <PathPickerField
          bind:value={target}
          placeholder="/path/to/restore/into"
          pickerTitle="Choose target folder"
          pickerDescription="Pick the folder to restore files into."
        >
          {#snippet title()}Target{/snippet}
          {#snippet description()}
            Where do you want this backup restored to?
          {/snippet}
        </PathPickerField>
      {/if}
    </Stack>
  </Stack>
</FormModal>
