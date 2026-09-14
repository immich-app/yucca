<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import type { LocalRepositoryDto, ScheduleDto } from "$lib/fetch-client";
  import type { ImmichBackupStatus } from "$lib/services/immich.integration.service";
  import { handleCreateBackup } from "$lib/services/repository.service";
  import { Button, FormatBytes, Icon } from "@immich/ui";
  import {
    mdiAlert,
    mdiArchiveOutline,
    mdiCheck,
    mdiCloudUploadOutline,
    mdiInformation,
    mdiProgressUpload,
  } from "@mdi/js";
  import cronstrue from "cronstrue";

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
  <StackListItem title="Your library" footerColor={appearance.color}>
    {#snippet icon()}
      <Icon icon={mdiArchiveOutline} />
    {/snippet}

    {#if repository.meter}
      <FormatBytes bytes={repository.meter.sizeBytes} />
    {:else}
      Estimated <FormatBytes bytes={repository.metrics.sizeBytes} />
    {/if} &middot;
    <span class="lowercase">
      {cronstrue.toString(schedule.cron, { verbose: true })}
    </span>

    {#snippet trailing()}
      <Button
        variant="ghost"
        size="small"
        class="whitespace-nowrap"
        leadingIcon={mdiCloudUploadOutline}
        onclick={() => void handleCreateBackup(repository.id)}
      >
        Back up now
      </Button>
    {/snippet}

    {#snippet footer()}
      <Icon icon={appearance.icon} />

      {#if status.kind === "offline"}
        Backup storage is offline.
      {:else if status.kind === "missing"}
        Backup is missing on the service.
      {:else if status.kind === "running"}
        Backup in progress
      {:else if status.kind === "failed"}
        Last backup failed <RelativeTime time={status.lastBackup} />
      {:else if status.kind === "warn"}
        Last backup finished with warnings <RelativeTime time={status.lastBackup} />
      {:else if status.kind === "complete"}
        Last backup successful <RelativeTime time={status.lastBackup} />
      {:else if status.kind === "paused"}
        Backups paused
      {:else}
        Backup is yet to run.
      {/if}
    {/snippet}
  </StackListItem>
</StackList>
