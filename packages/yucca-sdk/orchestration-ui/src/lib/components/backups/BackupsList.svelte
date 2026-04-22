<script lang="ts">
  import type { RepositoryListResponseDto } from "$lib/fetch-client";
  import {
    Alert,
    Button,
    Heading,
    LoadingSpinner,
    modalManager,
  } from "@immich/ui";
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import BackupItem from "./BackupItem.svelte";
  import CreateRepositoryModal from "./dialogs/CreateRepositoryModal.svelte";
  import OnEvents from "../util/OnEvents.svelte";
  import {
    useRepositories,
    useRepositoryEventHandler,
  } from "$lib/services/repository.service";

  interface Props {
    local?: boolean;
    initialData?: RepositoryListResponseDto;
  }

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

{#if query.isLoading}
  <LoadingSpinner />
{:else if query.isError}
  <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
{:else if query.isSuccess}
  <div class="flex flex-col gap-4">
    {#if local}
      <div class="flex flex-col gap-2">
        <Heading
          >Backups on this machine <div class="inline-block">
            <Button
              shape="round"
              size="tiny"
              variant="outline"
              onclick={createNewBackup}>Create new backup</Button
            >
          </div></Heading
        >
        {#each localRepositories as repository (repository.id)}
          <BackupItem {repository} />
        {/each}
      </div>
    {/if}

    <div class="flex flex-col gap-2">
      {#if local}
        <Heading>Backups found elsewhere</Heading>
      {:else}
        <Heading>Your Backups</Heading>
      {/if}

      {#each remoteRepositories as repository (repository.id)}
        <BackupItem {repository} />
      {/each}
    </div>
  </div>
{/if}
