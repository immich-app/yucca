<script lang="ts">
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import type { SnapshotDto } from "$lib/fetch-client";
  import { getSnapshotActions } from "$lib/services/snapshot.service";
  import { FormatBytes, HStack, Text } from "@immich/ui";

  type Props = {
    repositoryId: string;
    snapshot: SnapshotDto;
    immich?: boolean;
  };

  const { repositoryId, snapshot, immich = false }: Props = $props();
  const { Restore, Rollback, Delete } = $derived(
    getSnapshotActions(repositoryId, snapshot, immich),
  );
</script>

<StackListItem actions={[Restore, Rollback, Delete]}>
  <HStack>
    <RelativeTime time={snapshot.time} />

    {#if snapshot.summary}
      <Text color="secondary">
        &middot; {snapshot.summary.totalFiles.toLocaleString()}
        {snapshot.summary.totalFiles > 1 ? "files" : "file"} &middot;
        <FormatBytes bytes={snapshot.summary.totalBytes} />
      </Text>

      {#if snapshot.summary.filesNew > 0 || snapshot.summary.filesChanged > 0}
        <Text color="muted" size="tiny">
          {#if snapshot.summary.filesNew > 0}
            &middot; {snapshot.summary.filesNew.toLocaleString()} new
          {/if}
          {#if snapshot.summary.filesChanged > 0}
            &middot; {snapshot.summary.filesChanged.toLocaleString()} changed
          {/if}
        </Text>
      {/if}
    {/if}
  </HStack>
</StackListItem>
