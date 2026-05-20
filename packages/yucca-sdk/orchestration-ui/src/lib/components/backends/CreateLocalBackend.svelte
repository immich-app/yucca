<script lang="ts">
  import PathPickerField from "$lib/components/ui/PathPickerField.svelte";
  import { useCreateLocalBackend } from "$lib/services/backend.service";
  import { FormModal, Stack } from "@immich/ui";

  type Props = {
    onClose: () => void;
    onCreate?: (backendId: string) => void;
  };

  let { onClose, onCreate }: Props = $props();

  let path = $state("");

  const mutation = useCreateLocalBackend();

  const onSubmit = () =>
    mutation.mutate(
      { path },
      {
        onSuccess: ({ backend }) => {
          onCreate?.(backend.id);
          onClose();
        },
      },
    );
</script>

<FormModal
  size="small"
  title="Create local backend"
  disabled={path.length === 0 || mutation.isPending}
  {onSubmit}
  {onClose}
>
  <Stack gap={4}>
    <PathPickerField
      bind:value={path}
      pickerTitle="Choose backend folder"
      pickerDescription="Pick the local directory where backups will be stored."
    >
      {#snippet title()}Path{/snippet}
      {#snippet description()}Local directory to store backups.{/snippet}
    </PathPickerField>
  </Stack>
</FormModal>
