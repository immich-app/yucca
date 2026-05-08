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
    {run.type === "restore" ? "Restoring" : "Backing up"} &middot; started
    <RelativeTime time={run.start} />
  {:else if run.status === "failed"}
    {run.type === "restore" ? "Restore" : "Backup"} failed
    {#if run.end}<RelativeTime time={run.end} />{/if}
  {:else}
    {run.type === "restore" ? "Restored" : "Backed up"}
    {#if run.end}<RelativeTime time={run.end} />{/if}
  {/if}
</StackListItem>
