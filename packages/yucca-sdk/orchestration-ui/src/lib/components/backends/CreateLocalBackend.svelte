<script lang="ts">
  import FileBrowserModal from "$lib/components/backups/dialogs/FileBrowserModal.svelte";
  import { handleCreateLocalBackend } from "$lib/services/backend.service";
  import {
    Button,
    Field,
    FormModal,
    HStack,
    Input,
    modalManager,
    Stack,
  } from "@immich/ui";

  interface Props {
    onClose: () => void;
    onCreate?: (backendId: string) => void;
  }

  let { onClose, onCreate }: Props = $props();

  let path = $state("");

  const onSubmit = async () => {
    const { backend } = await handleCreateLocalBackend({ path });
    onCreate?.(backend.id);
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
