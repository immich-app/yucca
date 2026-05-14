<script lang="ts">
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import type { RunDto } from "$lib/fetch-client";
  import { getRunActions } from "$lib/services/runHistory.service";
  import { Icon } from "@immich/ui";
  import {
    mdiAlertCircleOutline,
    mdiCheckCircleOutline,
    mdiLoading,
  } from "@mdi/js";

  type Props = {
    run: RunDto;
  };

  const { run }: Props = $props();
  const { ViewLog } = $derived(getRunActions(run));
</script>

<StackListItem actions={[ViewLog]}>
  {#snippet icon()}
    {#if run.status === "complete"}
      <Icon icon={mdiCheckCircleOutline} class="text-success-500" />
    {:else if run.status === "failed"}
      <Icon icon={mdiAlertCircleOutline} class="text-danger-500" />
    {:else}
      <Icon icon={mdiLoading} class="animate-spin opacity-60" />
    {/if}
  {/snippet}

  {#if run.status === "incomplete"}
    {#if run.type === "restore"}Restoring{:else if run.type === "forget"}Pruning{:else}Backing
      up{/if} &middot; started
    <RelativeTime time={run.start} />
  {:else if run.status === "failed"}
    {#if run.type === "restore"}Restore{:else if run.type === "forget"}Prune{:else}Backup{/if}
    failed
    {#if run.end}<RelativeTime time={run.end} />{/if}
  {:else}
    {#if run.type === "restore"}Restored{:else if run.type === "forget"}Pruned{:else}Backed
      up{/if}
    {#if run.end}<RelativeTime time={run.end} />{/if}
  {/if}
</StackListItem>
