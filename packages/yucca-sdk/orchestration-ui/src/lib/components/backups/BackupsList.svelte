<script lang="ts">
  import type { RepositoryListResponseDto } from "$lib/fetch-client";
  import {
    useRepositories,
    useRepositoryEventHandler,
  } from "$lib/services/repository.service";
  import { Button, HStack, modalManager, Stack, Text } from "@immich/ui";
  import StackList from "../ui/StackList.svelte";
  import OnEvents from "../util/OnEvents.svelte";
  import BackupItem from "./BackupItem.svelte";
  import CreateRepositoryModal from "./dialogs/CreateRepositoryModal.svelte";

  type Props = {
    local?: boolean;
    initialData?: RepositoryListResponseDto;
  };

  const { local, initialData }: Props = $props();

  // svelte-ignore state_referenced_locally
  const query = useRepositories(initialData?.repositories);

  const { onRepositoryCreate, onRepositoryUpdate, onRepositoryDelete } =
    useRepositoryEventHandler();

  const localRepositories = $derived(
    query.data?.filter((repository) => repository.configuration) ?? [],
  );

  const remoteRepositories = $derived(
    query.data?.filter((repository) => !repository.configuration) ?? [],
  );

  const createNewBackup = () => modalManager.show(CreateRepositoryModal);
</script>

<OnEvents {onRepositoryCreate} {onRepositoryUpdate} {onRepositoryDelete} />

<Stack gap={6}>
  {#if local}
    <Stack gap={2}>
      <StackList {query}>
        {#snippet title()}Backups on this machine{/snippet}
        {#snippet children()}
          {#each localRepositories as repository (repository.id)}
            <BackupItem {repository} />
          {/each}
          {#if localRepositories.length === 0}
            <Text class="text-center py-6" color="muted">
              No backups on this machine yet.
            </Text>
          {/if}
        {/snippet}
      </StackList>

      <HStack>
        <Button
          shape="round"
          size="tiny"
          variant="outline"
          onclick={createNewBackup}>Create new backup</Button
        >
      </HStack>
    </Stack>
  {/if}

  <StackList {query}>
    {#snippet title()}
      {local ? "Backups found elsewhere" : "Your Backups"}
    {/snippet}
    {#snippet children()}
      {#each remoteRepositories as repository (repository.id)}
        <BackupItem {repository} />
      {/each}
      {#if remoteRepositories.length === 0}
        <Text class="text-center py-6" color="muted">
          {local ? "No other backups found." : "No backups yet."}
        </Text>
      {/if}
    {/snippet}
  </StackList>
</Stack>
