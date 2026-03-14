<script lang="ts">
  import {
    Field,
    FormModal,
    IconButton,
    Input,
    modalManager,
    Stack,
  } from "@immich/ui";
  import { handleRestoreSnapshot } from "$lib/services/snapshot.service";
  import ViewLogModal from "./ViewLogModal.svelte";
  import { mdiFolder } from "@mdi/js";
  import FileBrowserModal from "./FileBrowserModal.svelte";

  interface Props {
    repository: string;
    snapshot: string;
    onClose: () => void;
  }

  let { repository, snapshot, onClose }: Props = $props();

  let path = $state("");

  const onSubmit = async () => {
    const { logId } = await handleRestoreSnapshot(repository, snapshot, {
      path,
    });

    onClose();

    modalManager.open(ViewLogModal, {
      logId,
    });
  };
</script>

<FormModal
  title="Restore Backup"
  disabled={path.length === 0}
  {onSubmit}
  {onClose}
>
  <Stack gap={4}>
    <Field
      label="Path"
      description="Where do you want this backup restored to?"
    >
      <Input bind:value={path} />
      <IconButton
        icon={mdiFolder}
        aria-label="Select folder"
        onclick={() =>
          modalManager.open(FileBrowserModal, {
            folders: true,
            onSelect: (value) => (path = value),
          })}
      />
    </Field>
  </Stack>
</FormModal>
