<script lang="ts">
  import { Button, Field, FormModal, HStack, Input, Stack } from "@immich/ui";
  import { modalManager } from "@immich/ui";
  import FileBrowserModal from "$lib/components/backups/dialogs/FileBrowserModal.svelte";
  import { handleCreateLocalBackend } from "$lib/services/backend.service";

  interface Props {
    onClose: () => void;
    onCreated?: () => void;
  }

  let { onClose, onCreated }: Props = $props();

  let path = $state("");

  const onSubmit = async () => {
    await handleCreateLocalBackend({ path });
    onCreated?.();
    onClose();
  };

  const browse = () => {
    modalManager.show(FileBrowserModal, {
      folders: true,
      onSelect: (selected: string) => (path = selected),
    });
  };
</script>

<FormModal
  size="small"
  title="Create local backend"
  disabled={path.length === 0}
  {onSubmit}
  {onClose}
>
  <Stack gap={4}>
    <Field label="Path" description="Local directory to store backups">
      <HStack gap={2}>
        <div class="grow">
          <Input bind:value={path} />
        </div>
        <Button size="small" variant="outline" onclick={browse}>Browse</Button>
      </HStack>
    </Field>
  </Stack>
</FormModal>
