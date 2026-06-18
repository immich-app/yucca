<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import type { LocalRepositoryDto, ScheduleDto } from "$lib/fetch-client";
  import {
    handlePauseSchedule,
    handleResumeSchedule,
  } from "$lib/services/schedule.service";
  import {
    FormatBytes,
    Heading,
    HStack,
    Icon,
    IconButton,
    Stack,
    Text,
  } from "@immich/ui";
  import {
    mdiAlert,
    mdiArchiveOutline,
    mdiCheck,
    mdiInformation,
    mdiPauseCircleOutline,
    mdiPlayCircleOutline,
  } from "@mdi/js";
  import cronstrue from "cronstrue";

  type Props = {
    repository: LocalRepositoryDto;
    schedule: ScheduleDto;
  };

  const { repository, schedule }: Props = $props();

  function togglePause() {
    if (schedule!.paused) {
      handleResumeSchedule(schedule!.id, "Immich");
    } else {
      handlePauseSchedule(schedule!.id, "Immich");
    }
  }
</script>

<StackList>
  <StackListItem>
    {#snippet icon()}
      <Icon icon={mdiArchiveOutline} size="32px" />
    {/snippet}

    <HStack gap={4}>
      <Stack gap={0}>
        <Heading size="tiny">Your library</Heading>
        <Text>
          {#if repository.meter}
            Estimated <FormatBytes bytes={repository.meter.sizeBytes} />
          {:else}
            <FormatBytes bytes={repository.metrics.sizeBytes} />
          {/if} &middot;
          <span class="lowercase"
            >{cronstrue.toString(schedule.cron, {
              verbose: true,
            })}</span
          >
        </Text>
      </Stack>
    </HStack>

    {#snippet trailing()}
      <IconButton
        variant="ghost"
        onclick={togglePause}
        aria-label={schedule.paused ? "Resume backups" : "Pause backups"}
        icon={schedule.paused ? mdiPlayCircleOutline : mdiPauseCircleOutline}
      />
    {/snippet}
  </StackListItem>

  {#if repository.metrics.lastBackup}
    {#if repository.metrics.lastBackup !== repository.metrics.lastSuccessfulBackup}
      <StackListItem class="bg-danger-100">
        <HStack>
          <Icon icon={mdiAlert} /> Last backup failed <RelativeTime
            time={repository.metrics.lastBackup}
          />
        </HStack>
      </StackListItem>
    {:else}
      <StackListItem class="bg-success-50">
        <HStack>
          <Icon icon={mdiCheck} /> Last backup successful <RelativeTime
            time={repository.metrics.lastBackup}
          />
        </HStack>
      </StackListItem>
    {/if}
  {:else}
    <StackListItem class="bg-warning-50">
      <HStack>
        <Icon icon={mdiInformation} /> Backup is yet to run.
      </HStack>
    </StackListItem>
  {/if}
</StackList>
