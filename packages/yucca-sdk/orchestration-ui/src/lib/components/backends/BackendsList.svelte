<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { options } from "$lib/options";
  import {
    handleSetupLocalStorage,
    handleStartYuccaLogin,
    useBackendEventHandler,
    useBackends,
  } from "$lib/services/backend.service";
  import { Button, HStack } from "@immich/ui";
  import StackList from "../ui/StackList.svelte";
  import OnEvents from "../util/OnEvents.svelte";
  import Suspense from "../util/Suspense.svelte";
  import BackendItem from "./BackendItem.svelte";

  type Props = {
    repository?: LocalRepositoryDto;
    actions?: boolean;
  };

  const { repository, actions = false }: Props = $props();

  const { advanced } = options;
  const query = useBackends();
  const { onBackendCreate } = useBackendEventHandler();

  const repositoryBackends = $derived(
    repository?.backends
      ? [
          {
            ...repository.backends.primary,
            primary: true,
          },
          ...repository.backends.secondary,
        ]
      : [],
  );
</script>

<OnEvents {onBackendCreate} />

{#snippet heading()}
  Where your backup is stored
{/snippet}

<StackList title={repository ? heading : undefined}>
  <Suspense {query}>
    {#snippet children(backends)}
      {#each backends as backend (backend.id)}
        {@const repositoryBackend = repositoryBackends.find(
          ({ id }) => backend.id === id,
        )}

        {#if typeof repository === typeof repositoryBackend}
          <BackendItem {repository} {backend} {repositoryBackend} />
        {/if}
      {/each}
    {/snippet}
  </Suspense>
</StackList>

{#if actions || $advanced}
  <HStack>
    <Button
      size="small"
      variant="outline"
      onclick={() => handleStartYuccaLogin()}>Login with FUTO Backups</Button
    >
    <Button
      size="small"
      variant="outline"
      onclick={() => handleSetupLocalStorage()}>New local storage</Button
    >
  </HStack>
{/if}
