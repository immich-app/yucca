<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { getRepositoryActions } from "$lib/services/repository.service";
  import { Badge, FormatBytes, Text } from "@immich/ui";
  import StackListItem from "../ui/StackListItem.svelte";
  import RelativeTime from "../util/RelativeTime.svelte";

  type Props = {
    repository: LocalRepositoryDto;
  };

  const { repository }: Props = $props();

  const { BackupNow, Snapshots, History, Configure, Import, MetricsHistory } =
    $derived(getRepositoryActions(repository));
</script>

<StackListItem
  actions={[BackupNow, Snapshots, History, Configure, Import, MetricsHistory]}
>
  <Text>{repository.name}</Text>

  {#if repository.backends}
    <Badge size="tiny" color="info">
      {#if repository.backends.primary.type === "yucca"}
        FUTO Backups
      {:else if repository.backends.primary.type === "local"}
        Local Storage
      {:else}
        S3 Server
      {/if}
    </Badge>
    {#if !repository.backends.primary.online}
      <Badge size="tiny" color="danger">Offline</Badge>
    {/if}
  {/if}

  {#if repository.worm}
    <Badge size="tiny" color="info">WORM</Badge>
  {/if}

  {#if repository.meter}
    <Badge size="tiny" color="secondary">
      <FormatBytes bytes={repository.meter?.sizeBytes} />
    </Badge>
  {:else}
    <Badge size="tiny" color="secondary">
      Estimated <FormatBytes bytes={repository.metrics.sizeBytes} />
    </Badge>
  {/if}

  {#snippet trailing()}
    {#if repository.metrics.lastBackup && (!repository.metrics.lastSuccessfulBackup || +new Date(repository.metrics.lastBackup) > +new Date(repository.metrics.lastSuccessfulBackup))}
      <Badge size="tiny" color="danger">
        Failed <RelativeTime time={repository.metrics.lastBackup} />
      </Badge>
    {:else if repository.metrics.lastSuccessfulBackup}
      <Badge size="tiny" color="success">
        Successful <RelativeTime
          time={repository.metrics.lastSuccessfulBackup}
        />
      </Badge>
    {:else}
      <Badge size="tiny" color="warning">Never backed up</Badge>
    {/if}
  {/snippet}
</StackListItem>
