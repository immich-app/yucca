<script lang="ts">
  import SelectBackendModal from "$lib/components/backends/dialogs/SelectBackendModal.svelte";
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { useReconfigureRepositoryPrimaryBackend } from "$lib/services/repository.service";
  import { Text } from "@immich/ui";

  type Props = {
    repository: LocalRepositoryDto;
    onClose: () => void;
  };

  const { repository, onClose }: Props = $props();

  const reconfigure = useReconfigureRepositoryPrimaryBackend();

  function onSelectBackend(backendId: string) {
    reconfigure.mutate(
      { id: repository.id, backendId },
      { onSuccess: onClose },
    );
  }
</script>

<SelectBackendModal
  title="Select new service"
  disabled={reconfigure.isPending}
  onSelect={onSelectBackend}
  onCancel={onClose}
>
  {#snippet leadingContent()}
    {#if repository.backends?.secondary.length}
      TODO: UI for promoting a secondary
    {/if}

    <Text
      >You may reset and reconfigure your backups by selecting one of the
      following.</Text
    >
  {/snippet}
</SelectBackendModal>
