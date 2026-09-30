<script lang="ts">
  import PathListField from "$lib/components/ui/PathListField.svelte";
  import PathPickerField from "$lib/components/ui/PathPickerField.svelte";
  import type { RepositorySnapshotRestoreRequestDto } from "$lib/fetch-client";
  import {
    handleGetSnapshotListing,
    useRestoreSnapshot,
  } from "$lib/services/snapshot.service";
  import {
    Field,
    FormModal,
    Heading,
    modalManager,
    Stack,
    Switch,
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
      <Heading tag="h3" class="px-1" size="tiny">{$t`Options`}</Heading>

      <Field
        label={$t`In-place restore`}
        description={$t`Restore files to where they were originally.`}
      >
        <Switch bind:checked={inPlace} />
      </Field>

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
