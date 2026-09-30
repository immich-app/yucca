<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { getProvider } from "$lib/providers";
  import { getRepositoryActions } from "$lib/services/repository.service";
  import { getBackupOutcome } from "$lib/utils/backup-status";
  import { Badge, FormatBytes, Icon } from "@immich/ui";
  import { mdiArchiveOutline } from "@mdi/js";
  import StackListItem from "../ui/StackListItem.svelte";
  import RelativeTime from "../util/RelativeTime.svelte";
  import { t, msg } from "svelte-i18n-lingui";

  type Props = {
    repository: LocalRepositoryDto;
  };

  const { repository }: Props = $props();

  const local = getProvider().api === "orchestrator";

  const BackendNames = {
    yucca: msg`FUTO Backups`,
    local: msg`Local Storage`,
    s3: msg`S3 Server`,
  };

  const outcome = $derived(getBackupOutcome(repository.metrics));

  const {
    BackupNow,
    Snapshots,
    History,
    Configure,
    Import,
    MetricsHistory,
    Delete,
  } = $derived(getRepositoryActions(repository, $t, local));
</script>

<StackListItem
  title={repository.name}
  color={outcome === "failed" ? "danger" : "primary"}
  actions={[
    BackupNow,
    Snapshots,
    History,
    Configure,
    Import,
    MetricsHistory,
    Delete,
  ]}
>
  {#snippet icon()}
    <Icon icon={mdiArchiveOutline} />
  {/snippet}

  {#if repository.backends}
    {$t(BackendNames[repository.backends.primary.type])} &middot;
  {/if}

  {#if repository.meter}
    <FormatBytes bytes={repository.meter.sizeBytes} />
  {:else}
    {$t`Estimated`} <FormatBytes bytes={repository.metrics.sizeBytes} />
  {/if}

  {#if repository.worm}
    &middot; {$t`write-only`}
  {/if}

  {#snippet trailing()}
    {#if repository.backends && !repository.backends.primary.online}
      <Badge size="tiny" color="danger">{$t`Offline`}</Badge>
    {/if}

    {#if outcome === "failed"}
      <Badge size="tiny" color="danger">
        {$t`Failed`} <RelativeTime time={repository.metrics.lastBackup!} />
      </Badge>
    {:else if outcome === "warn"}
      <Badge size="tiny" color="warning">
        {$t`Warnings`} <RelativeTime time={repository.metrics.lastBackup!} />
      </Badge>
    {:else if outcome === "complete"}
      <Badge size="tiny" color="success">
        {$t`Successful`} <RelativeTime time={repository.metrics.lastBackup!} />
      </Badge>
    {:else}
      <Badge size="tiny" color="warning">{$t`Never backed up`}</Badge>
    {/if}
  {/snippet}
</StackListItem>
