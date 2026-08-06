<script lang="ts">
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import type { SnapshotDto } from "$lib/fetch-client";
  import { getSnapshotActions } from "$lib/services/snapshot.service";
  import { FormatBytes, Icon } from "@immich/ui";
  import { mdiHistory } from "@mdi/js";
  import { DateTime } from "luxon";

  type Props = {
    repositoryId: string;
    snapshot: SnapshotDto;
    immich?: boolean;
  };

  const { repositoryId, snapshot, immich = false }: Props = $props();
  const { Restore, Rollback, Delete } = $derived(
    getSnapshotActions(repositoryId, snapshot, immich),
  );

  const title = $derived(
    DateTime.fromISO(snapshot.time).toLocaleString(DateTime.DATE_FULL),
  );
</script>

<StackListItem {title} actions={[Restore, Rollback, Delete]}>
  {#snippet icon()}
    <Icon icon={mdiHistory} />
  {/snippet}

  <RelativeTime time={snapshot.time} />

  {#if snapshot.summary}
    &middot; {snapshot.summary.totalFiles.toLocaleString()}
    {snapshot.summary.totalFiles > 1 ? "files" : "file"} &middot;
    <FormatBytes bytes={snapshot.summary.totalBytes} />

    {#if snapshot.summary.filesNew > 0}
      &middot; {snapshot.summary.filesNew.toLocaleString()} new
    {/if}
    {#if snapshot.summary.filesChanged > 0}
      &middot; {snapshot.summary.filesChanged.toLocaleString()} changed
    {/if}
  {/if}
</StackListItem>
