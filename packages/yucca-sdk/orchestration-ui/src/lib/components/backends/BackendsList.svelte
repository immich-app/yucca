<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { options } from "$lib/options";
  import {
    handleSetupLocalStorage,
    useBackendEventHandler,
    useBackends,
    useYuccaLogin,
  } from "$lib/services/backend.service";
  import { Button, HStack } from "@immich/ui";
  import StackList from "../ui/StackList.svelte";
  import OnEvents from "../util/OnEvents.svelte";
  import Suspense from "../util/Suspense.svelte";
  import BackendItem from "./BackendItem.svelte";

  type Props = {
    repository?: LocalRepositoryDto;
  };

  const { repository }: Props = $props();

  const { advanced } = options;
  const query = useBackends();
  const yuccaLogin = useYuccaLogin();
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

<Suspense {query}>
  <StackList>
    {#snippet title()}
      {#if repository}
        Where your backup is stored
      {:else}
        Configured backends
      {/if}
    {/snippet}

    {#each query.data as backend (backend.id)}
      {@const repositoryBackend = repositoryBackends.find(
        ({ id }) => backend.id === id,
      )}

      {#if typeof repository === typeof repositoryBackend}
        <BackendItem {repository} {backend} {repositoryBackend} />
      {/if}
    {/each}
  </StackList>

  {#if $advanced}
    <HStack>
      <Button
        size="small"
        variant="outline"
        loading={yuccaLogin.isPending}
        onclick={() => yuccaLogin.mutate(undefined)}>Login with FUTO Backups</Button
      >
      <Button
        size="small"
        variant="outline"
        onclick={() => handleSetupLocalStorage()}>New local storage</Button
      >
    </HStack>
  {/if}
</Suspense>
