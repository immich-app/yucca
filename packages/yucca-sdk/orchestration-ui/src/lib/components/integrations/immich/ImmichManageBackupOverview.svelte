<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import type { LocalRepositoryDto, ScheduleDto } from "$lib/fetch-client";
  import type { ImmichBackupStatus } from "$lib/services/immich.integration.service";
  import { handleCreateBackup } from "$lib/services/repository.service";
  import { handleCancelTask } from "$lib/services/task.service";
  import { Button, FormatBytes, Icon } from "@immich/ui";
  import {
    mdiAlert,
    mdiArchiveOutline,
    mdiCheck,
    mdiCloudUploadOutline,
    mdiInformation,
    mdiProgressUpload,
    mdiStopCircleOutline,
  } from "@mdi/js";
  import cronstrue from "cronstrue";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    repository: LocalRepositoryDto;
    schedule: ScheduleDto;
    status: ImmichBackupStatus;
  };

  const { repository, schedule, status }: Props = $props();

  const appearance = $derived.by(() => {
    switch (status.kind) {
      case "running": {
        return { color: "primary", icon: mdiProgressUpload } as const;
      }
      case "offline":
      case "missing":
      case "failed": {
        return { color: "danger", icon: mdiAlert } as const;
      }
      case "warn": {
        return { color: "warning", icon: mdiAlert } as const;
      }
      case "incomplete":
      case "cancelled": {
        return { color: "warning", icon: mdiAlert } as const;
      }
      case "complete": {
        return { color: "success", icon: mdiCheck } as const;
      }
      default: {
        return { color: "warning", icon: mdiInformation } as const;
      }
    }
  });

</script>

<StackList>
  <StackListItem title={$t`Your library backup`} footerColor={appearance.color}>
    {#snippet icon()}
      <Icon icon={mdiArchiveOutline} />
    {/snippet}

    {#if repository.meter}
      <FormatBytes bytes={repository.meter.sizeBytes} />
    {:else}
      {$t`Estimated`} <FormatBytes bytes={repository.metrics.sizeBytes} />
    {/if} &middot;
    {#if status.kind === "paused"}
      {$t`Backups paused`}
    {:else}
      <span class="lowercase">
        {cronstrue.toString(schedule.cron, { verbose: true })}
      </span>
    {/if}

    {#snippet trailing()}
      {@const running = status.kind === "running"}
      <Button
        variant="ghost"
        size="small"
        color={running ? "danger" : "primary"}
        class="whitespace-nowrap"
        leadingIcon={running ? mdiStopCircleOutline : mdiCloudUploadOutline}
        onclick={() =>
          void (running
            ? handleCancelTask(repository.id)
            : handleCreateBackup(repository.id))}
      >
        {running ? $t`Cancel backup` : $t`Back up now`}
      </Button>
    {/snippet}

    {#snippet footer()}
      <Icon icon={appearance.icon} />

      {#if status.kind === "offline"}
        {$t`Backup storage is offline.`}
      {:else if status.kind === "missing"}
        {$t`Backup is missing on the service.`}
      {:else if status.kind === "running"}
        {$t`Backup in progress`}
      {:else if status.kind === "failed"}
        {$t`Last backup failed`} <RelativeTime time={status.lastBackup} />
      {:else if status.kind === "warn"}
        {$t`Last backup finished with warnings`} <RelativeTime time={status.lastBackup} />
      {:else if status.kind === "incomplete"}
        {$t`Last backup did not complete`} <RelativeTime time={status.lastBackup} />
      {:else if status.kind === "cancelled"}
        {$t`Last backup was cancelled`} <RelativeTime time={status.lastBackup} />
      {:else if status.kind === "complete"}
        {$t`Last backup successful`} <RelativeTime time={status.lastBackup} />
      {:else if status.kind === "paused"}
        {$t`Backups paused`}
      {:else}
        {$t`Backup is yet to run.`}
      {/if}
    {/snippet}
  </StackListItem>
</StackList>
