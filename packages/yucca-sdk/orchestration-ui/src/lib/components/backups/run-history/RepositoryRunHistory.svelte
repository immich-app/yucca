<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import {
    useRunEventHandler,
    useRunHistory,
  } from "$lib/services/runHistory.service";
  import RepositoryRunHistoryItem from "./RepositoryRunHistoryItem.svelte";

  type Props = {
    repository: LocalRepositoryDto;
  };

  let { repository }: Props = $props();

  // svelte-ignore state_referenced_locally
  const query = useRunHistory(repository.id);
  const { onRunCreate, onRunUpdate } = useRunEventHandler();
</script>

<OnEvents {onRunCreate} {onRunUpdate} />

<StackList {query}>
  {#snippet title()}
    Recent backup attempts
  {/snippet}

  {#snippet children(runs)}
    {#each runs.slice(0, 10) as run (run.id)}
      <RepositoryRunHistoryItem {run} />
    {/each}
  {/snippet}
</StackList>
