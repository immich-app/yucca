<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import {
    useSnapshotEventHandler,
    useSnapshots,
  } from "$lib/services/snapshot.service";
  import { Text } from "@immich/ui";
  import RepositorySnapshotsListItem from "./RepositorySnapshotsListItem.svelte";

  type Props = {
    repository: LocalRepositoryDto;
  };

  let { repository }: Props = $props();

  // svelte-ignore state_referenced_locally
  const query = useSnapshots(repository.id);
  const { onRunUpdate } = useSnapshotEventHandler();
</script>

<OnEvents {onRunUpdate} />

<StackList {query}>
  {#snippet title()}
    Snapshots
  {/snippet}

  {#snippet children(snapshots)}
    {#if snapshots.length === 0}
      <Text class="text-center py-6" color="muted">No backups yet</Text>
    {:else}
      {#each snapshots.slice(0, 10) as snapshot (snapshot.id)}
        <RepositorySnapshotsListItem repositoryId={repository.id} {snapshot} />
      {/each}
    {/if}
  {/snippet}
</StackList>
