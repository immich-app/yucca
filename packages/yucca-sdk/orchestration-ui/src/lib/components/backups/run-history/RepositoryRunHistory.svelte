<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { queryClient } from "$lib/query-client";
  import {
    runHistoryKeys,
    useRunHistory,
  } from "$lib/services/runHistory.service";
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import { Alert, LoadingSpinner } from "@immich/ui";
  import RepositoryRunHistoryItem from "./RepositoryRunHistoryItem.svelte";

  interface Props {
    repository: LocalRepositoryDto;
  }

  let { repository }: Props = $props();

  // svelte-ignore state_referenced_locally
  const query = useRunHistory(repository.id);

  // TODO: publish run history events
  const temp__invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: runHistoryKeys.byRepository(repository.id),
    });
  };
</script>

<OnEvents onTaskStart={temp__invalidate} onTaskEnd={temp__invalidate} />

{#if query.isLoading}
  <LoadingSpinner />
{:else if query.isError}
  <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
{:else if query.isSuccess}
  <StackList>
    {#snippet title()}
      Recent backup attempts
    {/snippet}

    {#each query.data.slice(0, 10) as run (run.id)}
      <RepositoryRunHistoryItem {run} />
    {/each}
  </StackList>
{/if}
