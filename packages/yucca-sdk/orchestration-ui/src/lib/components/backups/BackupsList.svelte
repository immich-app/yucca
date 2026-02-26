<script lang="ts">
  import type {
    LocalRepositoryDto,
    RepositoryListResponseDto,
  } from "$lib/fetch-client";
  import { getProvider } from "$lib/providers";
  import {
    Badge,
    Button,
    Card,
    CardBody,
    CardFooter,
    FormatBytes,
    Heading,
    HStack,
    IconButton,
  } from "@immich/ui";
  import { onMount } from "svelte";
  import { DateTime } from "luxon";
  import { mdiPlus } from "@mdi/js";
  import BackupItem from "./BackupItem.svelte";

  interface Props {
    initialData?: RepositoryListResponseDto;
  }

  const { initialData }: Props = $props();

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
</script>

<div class="flex flex-col gap-4">
  {#if localRepositories.length > 0}
    <div class="flex flex-col gap-2">
      <Heading
        >Backups on this machine <div class="inline-block">
          <IconButton
            shape="round"
            size="tiny"
            icon={mdiPlus}
            variant="outline"
            aria-label={`Create new backup`}
          />
        </div></Heading
      >
      {#each localRepositories as repository (repository.id)}
        <BackupItem {repository} onUpdate={onUpdate(repository.id)} />
      {/each}
    </div>
  {/if}

  {#if remoteRepositories.length > 0}
    <div class="flex flex-col gap-2">
      <Heading>Backups found elsewhere</Heading>
      {#each remoteRepositories as repository (repository.id)}
        <BackupItem {repository} onUpdate={onUpdate(repository.id)} />
      {/each}
    </div>
  {/if}
</div>
