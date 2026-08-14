<script lang="ts">
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import type { RunDto } from "$lib/fetch-client";
  import { getRunActions } from "$lib/services/runHistory.service";
  import { Icon } from "@immich/ui";
  import {
    mdiCloudCheckOutline,
    mdiCloudOffOutline,
    mdiCloudSyncOutline,
  } from "@mdi/js";

  type Props = {
    run: RunDto;
  };

  const { run }: Props = $props();
  const { ViewLog } = $derived(getRunActions(run));

  const nouns = {
    restore: { name: "restore", running: "Restore", done: "Restored" },
    forget: { name: "prune", running: "Prune", done: "Pruned" },
    backup: { name: "backup", running: "Backup", done: "Backed up" },
  };

  const noun = $derived(
    run.type === "restore" || run.type === "forget"
      ? nouns[run.type]
      : nouns.backup,
  );

  const status = $derived.by(() => {
    switch (run.status) {
      case "failed": {
        return {
          title: `Failed ${noun.name}`,
          color: "danger",
          icon: mdiCloudOffOutline,
        } as const;
      }
      case "warn": {
        return {
          title: `${noun.done} with warnings`,
          color: "warning",
          icon: mdiCloudCheckOutline,
        } as const;
      }
      case "incomplete": {
        return {
          title: `${noun.running} in progress`,
          color: "primary",
          icon: mdiCloudSyncOutline,
        } as const;
      }
      default: {
        return {
          title: `Successful ${noun.name}`,
          color: "success",
          icon: mdiCloudCheckOutline,
        } as const;
      }
    }
  });
</script>

<StackListItem title={status.title} color={status.color} actions={[ViewLog]}>
  {#snippet icon()}
    <Icon icon={status.icon} />
  {/snippet}

  {#if run.status === "incomplete"}
    Started <RelativeTime time={run.start} />
  {:else if run.status === "failed"}
    Attempted {#if run.end}<RelativeTime time={run.end} />{/if}
  {:else}
    {noun.done} {#if run.end}<RelativeTime time={run.end} />{/if}
  {/if}
</StackListItem>
