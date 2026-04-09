<script lang="ts">
  import {
    Button,
    Card,
    CardBody,
    HStack,
    immichLogo,
    modalManager,
    Text,
  } from "@immich/ui";
  import type { ScheduleDto } from "$lib/fetch-client";
  import {
    handlePauseSchedule,
    handleResumeSchedule,
  } from "$lib/services/schedule.service";
  import CreateImmichBackup from "../backups/dialogs/ConfigureImmichBackup.svelte";
  import RelativeTime from "../util/RelativeTime.svelte";

  type Props = {
    schedule?: ScheduleDto;
  };

  const { schedule }: Props = $props();

  const onConfigure = () => {
    modalManager.open(CreateImmichBackup, {});
  };

  const onTogglePause = () => {
    if (schedule!.paused) {
      handleResumeSchedule(schedule!.id, schedule!.name);
    } else {
      handlePauseSchedule(schedule!.id, schedule!.name);
    }
  };
</script>

<Card>
  <CardBody>
    <div class="flex items-center gap-4">
      <img src={immichLogo} alt="Immich" class="h-12 w-12" />

      <div class="flex-1">
        <Text size="large">Immich Backup</Text>
        {#if schedule?.lastFinished}
          <Text color="success" class="text-sm">
            Successful <RelativeTime time={schedule.lastFinished} />
          </Text>
        {:else if schedule?.lastRun}
          <Text color="warning" class="text-sm">
            Running since <RelativeTime time={schedule.lastRun} />
          </Text>
        {:else}
          <Text color="secondary" class="text-sm">Never run</Text>
        {/if}
      </div>

      <HStack gap={2}>
        <Button size="small" variant="outline" onclick={onConfigure}
          >Configure</Button
        >
        {#if schedule}
          <Button
            size="small"
            variant="outline"
            color={schedule.paused ? "primary" : "danger"}
            onclick={onTogglePause}
          >
            {schedule.paused ? "Resume" : "Pause"}
          </Button>
        {/if}
      </HStack>
    </div>
  </CardBody>
</Card>
