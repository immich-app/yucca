<script lang="ts">
  import SelectRepositoryModal from "$lib/components/backups/dialogs/SelectRepositoryModal.svelte";
  import { useInspectRepositories } from "$lib/services/repository.service";
  import { Button } from "@immich/ui";
  import RestorePointFlow2SelectSnapshot from "./RestorePointFlow2SelectSnapshot.svelte";

  type Props = {
    onCancel: () => void;
    onImportKey: () => void;
    onFinish: () => void;
  };

  const { onCancel, onImportKey, onFinish }: Props = $props();

  const query = useInspectRepositories();

  let selectedRepository: string | undefined = $state();

  const repository = $derived(
    query.data?.find((repository) => repository.id === selectedRepository),
  );
</script>

{#if repository}
  <RestorePointFlow2SelectSnapshot
    onBack={() => (selectedRepository = undefined)}
    {repository}
    {onFinish}
  />
{:else}
  <SelectRepositoryModal
    onSelect={(repositoryId) => (selectedRepository = repositoryId)}
    {onCancel}
  >
    {#snippet footerContent()}
      <Button variant="ghost" onclick={onImportKey}>
        Import a different key
      </Button>
    {/snippet}
  </SelectRepositoryModal>
{/if}
