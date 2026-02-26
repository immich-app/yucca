<script lang="ts">
  import type {
    LocalRepositoryDto,
    RepositoryListResponseDto,
  } from "$lib/fetch-client";
  import { getProvider } from "$lib/providers";
  import { Button, Heading, modalManager, toastManager } from "@immich/ui";
  import { onMount } from "svelte";
  import BackupItem from "./BackupItem.svelte";
  import CreateRepositoryModal from "./dialogs/CreateRepositoryModal.svelte";

  interface Props {
    local?: boolean;
    initialData?: RepositoryListResponseDto;
  }

  const { local, initialData }: Props = $props();

  // svelte-ignore state_referenced_locally
  let repositories = $state(initialData?.repositories);

  const provider = getProvider();

  onMount(() => {
    if (!repositories) {
      provider
        .getRepositories()
        .then((data) => (repositories = data.repositories));
    }
  });

  const localRepositories = $derived(
    repositories?.filter((repository) => repository.backends) ?? [],
  );

  const remoteRepositories = $derived(
    repositories?.filter((repository) => !repository.backends) ?? [],
  );

  const onUpdate = (id: string) => (partial: Partial<LocalRepositoryDto>) => {
    repositories = repositories?.map((repository) =>
      repository.id === id
        ? {
            ...repository,
            ...partial,
          }
        : repository,
    );
  };

  const createNewBackup = async () => {
    modalManager.show(CreateRepositoryModal, {
      onCreate: (repository) => repositories?.push(repository),
      onUpdate,
    });
  };
</script>

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
        <BackupItem {repository} onUpdate={onUpdate(repository.id)} />
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
      <BackupItem {repository} onUpdate={onUpdate(repository.id)} />
    {/each}
  </div>
</div>
