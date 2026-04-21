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
  import type { RepositoryMetricsDto, ScheduleDto } from "$lib/fetch-client";
  import {
    handlePauseSchedule,
    handleResumeSchedule,
  } from "$lib/services/schedule.service";
  import CreateImmichBackup from "../backups/dialogs/ConfigureImmichBackup.svelte";
  import RelativeTime from "../util/RelativeTime.svelte";

  type Props = {
    schedule?: ScheduleDto;
    metrics?: RepositoryMetricsDto;
    unconfigured?: boolean;
  };

  const { schedule, metrics, unconfigured = false }: Props = $props();

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
        {#if unconfigured}
          <Text color="secondary" class="text-sm">
            Set up Immich automatic backups
          </Text>
        {:else if metrics?.lastBackup && (!metrics.lastSuccessfulBackup || metrics.lastBackup > metrics.lastSuccessfulBackup)}
          <Text color="danger" class="text-sm">
            Failed <RelativeTime time={metrics.lastBackup} />
          </Text>
        {:else if metrics?.lastSuccessfulBackup}
          <Text color="success" class="text-sm">
            Successful <RelativeTime time={metrics.lastSuccessfulBackup} />
          </Text>
        {:else}
          <Text color="secondary" class="text-sm">Never run</Text>
        {/if}
      </div>

      <HStack gap={2}>
        {#if unconfigured}
          <Button size="small" color="primary" onclick={onConfigure}
            >Set Up</Button
          >
        {:else}
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
        {/if}
      </HStack>
    </div>
  </CardBody>
</Card>
