<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { options } from "$lib/options";
  import {
    handleSetupLocalStorage,
    handleYuccaLogin,
    useBackendEventHandler,
    useBackends,
  } from "$lib/services/backend.service";
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import { Alert, Button, HStack, LoadingSpinner } from "@immich/ui";
  import StackList from "../ui/StackList.svelte";
  import OnEvents from "../util/OnEvents.svelte";
  import BackendItem from "./BackendItem.svelte";

  type Props = {
    repository?: LocalRepositoryDto;
  };

  const { repository }: Props = $props();

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

{#if query.isLoading}
  <LoadingSpinner />
{:else if query.isError}
  <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
{:else if query.isSuccess}
  <StackList>
    {#snippet title()}
      {#if repository}
        Where your backup is stored
      {:else}
        Configured backends
      {/if}
    {/snippet}

    {#each query.data as backend (backend.id)}
      <BackendItem
        {backend}
        repositoryBackend={repositoryBackends.find(
          ({ id }) => backend.id === id,
        )}
      />
    {/each}
  </StackList>

  {#if $advanced}
    <HStack>
      <Button size="small" variant="outline" onclick={handleYuccaLogin}
        >Login with FUTO Backups</Button
      >
      <Button size="small" variant="outline" onclick={handleSetupLocalStorage}
        >New local storage</Button
      >
    </HStack>
  {/if}
{/if}
