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
  import { t, msg } from "svelte-i18n-lingui";

  type Props = {
    run: RunDto;
  };

  const { run }: Props = $props();
  const { ViewLog, DownloadLog } = $derived(getRunActions(run, $t));

  const nouns = {
    restore: {
      name: msg`restore`,
      running: msg`Restore`,
      done: msg`Restored`,
    },
    forget: { name: msg`prune`, running: msg`Prune`, done: msg`Pruned` },
    backup: { name: msg`backup`, running: msg`Backup`, done: msg`Backed up` },
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
          title: $t({
            message: "Failed {noun}",
            values: { noun: $t(noun.name) },
          }),
          color: "danger",
          icon: mdiCloudOffOutline,
        } as const;
      }
      case "cancelled": {
        return {
          title: $t({
            message: "Cancelled {noun}",
            values: { noun: $t(noun.name) },
          }),
          color: "warning",
          icon: mdiCloudOffOutline,
        } as const;
      }
      case "warn": {
        return {
          title: $t({
            message: "{done} with warnings",
            values: { done: $t(noun.done) },
          }),
          color: "warning",
          icon: mdiCloudCheckOutline,
        } as const;
      }
      case "incomplete": {
        return {
          title: $t({
            message: "{running} in progress",
            values: { running: $t(noun.running) },
          }),
          color: "primary",
          icon: mdiCloudSyncOutline,
        } as const;
      }
      default: {
        return {
          title: $t({
            message: "Successful {noun}",
            values: { noun: $t(noun.name) },
          }),
          color: "success",
          icon: mdiCloudCheckOutline,
        } as const;
      }
    }
  });
</script>

<StackListItem title={status.title} color={status.color} actions={[ViewLog, DownloadLog]}>
  {#snippet icon()}
    <Icon icon={status.icon} />
  {/snippet}

  {#if run.status === "incomplete"}
    {$t`Started`} <RelativeTime time={run.start} />
  {:else if run.status === "failed" || run.status === "cancelled"}
    {$t`Attempted`} {#if run.end}<RelativeTime time={run.end} />{/if}
  {:else}
    {$t(noun.done)} {#if run.end}<RelativeTime time={run.end} />{/if}
  {/if}
</StackListItem>
