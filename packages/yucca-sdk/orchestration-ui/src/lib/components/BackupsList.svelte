<script lang="ts">
  import {
    Badge,
    Button,
    Card,
    CardBody,
    CardFooter,
    Heading,
    HStack,
    Icon,
    IconButton,
    immichLogo,
  } from "@immich/ui";
  import { mdiArchiveOutline, mdiPlus } from "@mdi/js";
  import { getProvider } from "$lib/providers";
  import { onMount } from "svelte";
  import type { RepositoryListResponseDto } from "$lib/fetch-client";
  import ConfigureRepository from "./scraps/ConfigureRepository.svelte";

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

  async function create() {
    if (!repositories) return; // todo: better handling

    repositories.push(
      await provider.createRepository().then(({ repository }) => repository),
    );
  }

  let editing: string | undefined = $state();
  let editingRepository = $derived(
    repositories?.find(({ id }) => id === editing),
  );
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-col gap-2">
    <Heading size="medium"
      >My Backups <div class="inline-block">
        <IconButton
          shape="round"
          size="tiny"
          icon={mdiPlus}
          variant="outline"
          aria-label={`Create new backup`}
          onclick={create}
        />
      </div></Heading
    >
    {#each repositories as repository (repository.id)}
      <Card>
        <CardBody class="flex flex-col gap-2">
          <HStack>
            <Icon icon={mdiArchiveOutline} size="32" color="gray" />
            <Heading class="break-all">{repository.id}</Heading>
          </HStack>
          <HStack wrap>
            {#if repository.backends}
              {#if repository.configuration}
                <Badge size="tiny" color="info"
                  >Backing up to {repository.backends.primary.type}</Badge
                >
                {#if !repository.backends.primary.online}
                  <Badge size="tiny" color="danger">Offline</Badge>
                {/if}
              {:else}
                <Badge size="tiny" color="info"
                  >Found on {repository.backends.primary.type}</Badge
                >
              {/if}
            {/if}
            <Badge size="tiny" color="secondary"
              >{repository.metrics.sizeBytes} B</Badge
            >
            {#if repository.metrics.lastUpload}
              <Badge size="tiny" color="success"
                >Backed up {Math.floor(
                  (Date.now() - +new Date(repository.metrics.lastUpload)) /
                    (1000 * 60 * 60 * 24),
                )} days ago</Badge
              >
            {/if}
          </HStack>
        </CardBody>
        <CardFooter class="flex gap-2">
          {#if repository.backends}
            {#if repository.configuration}
              {#if repository.backends.primary.online}
                <Button
                  size="tiny"
                  onclick={() =>
                    provider
                      .createBackup(repository.id)
                      .then(() => alert("success"))}>Backup now</Button
                >
              {:else}
                <Badge size="tiny" color="danger"
                  >Backend is unavailable or repository is missing on remote.</Badge
                >
              {/if}
              <Button size="tiny">Logs (🚧)</Button>
              <Button size="tiny" onclick={() => (editing = repository.id)}
                >Configure</Button
              >
            {:else}
              <Button size="tiny">Import (🚧)</Button>
            {/if}
          {:else}
            [Options visible on yucca web portal]
          {/if}
        </CardFooter>
      </Card>
    {/each}
  </div>
</div>

{#if editingRepository?.configuration}
  <ConfigureRepository
    id={editingRepository.id}
    configuration={editingRepository.configuration}
    onClose={() => (editing = undefined)}
    onUpdate={(updated) => {
      repositories = repositories?.map((repository) =>
        repository.id === editing
          ? { ...repository, configuration: updated }
          : repository,
      );
    }}
  />
{/if}
