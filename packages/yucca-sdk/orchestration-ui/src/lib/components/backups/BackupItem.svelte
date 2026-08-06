<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { getRepositoryActions } from "$lib/services/repository.service";
  import { Badge, FormatBytes, Icon } from "@immich/ui";
  import { mdiArchiveOutline } from "@mdi/js";
  import StackListItem from "../ui/StackListItem.svelte";
  import RelativeTime from "../util/RelativeTime.svelte";

  type Props = {
    repository: LocalRepositoryDto;
  };

  const { repository }: Props = $props();

  const BackendNames = {
    yucca: "FUTO Backups",
    local: "Local Storage",
    s3: "S3 Server",
  };

  const failed = $derived(
    repository.metrics.lastBackup &&
      (!repository.metrics.lastSuccessfulBackup ||
        +new Date(repository.metrics.lastBackup) >
          +new Date(repository.metrics.lastSuccessfulBackup)),
  );

  const { BackupNow, Snapshots, History, Configure, Import, MetricsHistory } =
    $derived(getRepositoryActions(repository));
</script>

<StackListItem
  title={repository.name}
  color={failed ? "danger" : "primary"}
  actions={[BackupNow, Snapshots, History, Configure, Import, MetricsHistory]}
>
  {#snippet icon()}
    <Icon icon={mdiArchiveOutline} />
  {/snippet}

  {#if repository.backends}
    {BackendNames[repository.backends.primary.type]} &middot;
  {/if}

  {#if repository.meter}
    <FormatBytes bytes={repository.meter.sizeBytes} />
  {:else}
    Estimated <FormatBytes bytes={repository.metrics.sizeBytes} />
  {/if}

  {#if repository.worm}
    &middot; write-only
  {/if}

  {#snippet trailing()}
    {#if repository.backends && !repository.backends.primary.online}
      <Badge size="tiny" color="danger">Offline</Badge>
    {/if}

    {#if failed}
      <Badge size="tiny" color="danger">
        Failed <RelativeTime time={repository.metrics.lastBackup!} />
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
