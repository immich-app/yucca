<script lang="ts">
  import type { RepositoryListResponseDto } from "$lib/fetch-client";
  import {
    useRepositories,
    useRepositoryEventHandler,
  } from "$lib/services/repository.service";
  import { Button, HStack, modalManager, Stack } from "@immich/ui";
  import StackList from "../ui/StackList.svelte";
  import StackListPlaceholder from "../ui/StackListPlaceholder.svelte";
  import OnEvents from "../util/OnEvents.svelte";
  import Suspense from "../util/Suspense.svelte";
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
      <StackList>
        {#snippet title()}Backups on this machine{/snippet}

        <Suspense {query}>
          {#each localRepositories as repository (repository.id)}
            <BackupItem {repository} {local} />
          {/each}

          {#if localRepositories.length === 0}
            <StackListPlaceholder>
              No backups on this machine yet.
            </StackListPlaceholder>
          {/if}
        </Suspense>
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

  <StackList>
    {#snippet title()}
      {local ? "Backups found elsewhere" : "Your Backups"}
    {/snippet}

    <Suspense {query}>
      {#each remoteRepositories as repository (repository.id)}
        <BackupItem {repository} />
      {/each}

      {#if remoteRepositories.length === 0}
        <StackListPlaceholder>
          {local ? "No other backups found." : "No backups yet."}
        </StackListPlaceholder>
      {/if}
    </Suspense>
  </StackList>
</Stack>
