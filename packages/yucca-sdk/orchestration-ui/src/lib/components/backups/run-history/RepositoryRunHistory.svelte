<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import {
    useRunEventHandler,
    useRunHistory,
  } from "$lib/services/runHistory.service";
  import { Button } from "@immich/ui";
  import RepositoryRunHistoryItem from "./RepositoryRunHistoryItem.svelte";

  type Props = {
    repository: LocalRepositoryDto;
    limit?: number;
    onViewAll?: () => void;
  };

  let { repository, limit = 5, onViewAll }: Props = $props();

  // svelte-ignore state_referenced_locally
  const query = useRunHistory(repository.id);
  const { onRunCreate, onRunUpdate } = useRunEventHandler();

  const isEmpty = $derived(query.data?.length === 0);
</script>

<OnEvents {onRunCreate} {onRunUpdate} />

<StackList {query} {isEmpty} empty="No recent backups">
  {#snippet title()}
    Recent backup attempts
  {/snippet}

  {#snippet action()}
    {#if onViewAll}
      <Button variant="ghost" size="small" onclick={onViewAll}>View all</Button>
    {/if}
  {/snippet}

  {#snippet children(runs)}
    {#each runs.slice(0, limit) as run (run.id)}
      <RepositoryRunHistoryItem {run} />
    {/each}
  {/snippet}
</StackList>
