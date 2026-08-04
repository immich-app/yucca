<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import type { LocalRepositoryDto, ScheduleDto } from "$lib/fetch-client";
  import { handleCreateBackup } from "$lib/services/repository.service";
  import { Button, FormatBytes, Icon } from "@immich/ui";
  import {
    mdiAlert,
    mdiArchiveOutline,
    mdiCheck,
    mdiCloudUploadOutline,
    mdiInformation,
  } from "@mdi/js";
  import cronstrue from "cronstrue";

  type Props = {
    repository: LocalRepositoryDto;
    schedule: ScheduleDto;
  };

  const { repository, schedule }: Props = $props();

  const status = $derived.by(() => {
    if (!repository.metrics.lastBackup) {
      return { color: "warning", icon: mdiInformation } as const;
    }

    return repository.metrics.lastBackup !==
      repository.metrics.lastSuccessfulBackup
      ? ({ color: "danger", icon: mdiAlert } as const)
      : ({ color: "success", icon: mdiCheck } as const);
  });

</script>

<StackList>
  <StackListItem title="Your library" footerColor={status.color}>
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
      <Icon icon={status.icon} />

      {#if !repository.metrics.lastBackup}
        Backup is yet to run.
      {:else if status.color === "danger"}
        Last backup failed <RelativeTime time={repository.metrics.lastBackup} />
      {:else}
        Last backup successful <RelativeTime
          time={repository.metrics.lastBackup}
        />
      {/if}
    {/snippet}
  </StackListItem>
</StackList>
