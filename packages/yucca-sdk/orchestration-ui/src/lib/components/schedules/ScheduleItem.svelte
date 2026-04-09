<script lang="ts">
  import type { ScheduleDto } from "$lib/fetch-client";
  import {
    Badge,
    Card,
    CardBody,
    Heading,
    HStack,
    IconButton,
    modalManager,
    Stack,
    Text,
  } from "@immich/ui";
  import { mdiCog, mdiDelete, mdiPause, mdiPlay } from "@mdi/js";
  import RelativeTime from "../util/RelativeTime.svelte";
  import ConfigureScheduleModal from "./dialogs/ConfigureScheduleModal.svelte";
  import {
    handlePauseSchedule,
    handleRemoveSchedule,
    handleResumeSchedule,
  } from "$lib/services/schedule.service";

  type Props = {
    schedule: ScheduleDto;
    repositoryNames: Record<string, string>;
  };

  const { schedule, repositoryNames }: Props = $props();

  const onResume = () => handleResumeSchedule(schedule.id, schedule.name);
  const onPause = () => handlePauseSchedule(schedule.id, schedule.name);

  const onConfigure = () => {
    modalManager.open(ConfigureScheduleModal, { schedule });
  };

  const onDelete = async () => {
    const confirm = await modalManager.showDialog({
      confirmText: "Delete",
      title: "Delete Schedule",
      prompt: "This schedule will be removed.",
    });

    if (!confirm) return;

    await handleRemoveSchedule(schedule.id, schedule.name);
  };
</script>

<Card>
  <CardBody>
    <HStack>
      <Stack>
        <Heading size="small">{schedule.name}</Heading>
        <HStack>
          <Badge size="tiny" color="info">{schedule.cron}</Badge>
          {#if schedule.paused}
            <Badge size="tiny" color="warning">Paused</Badge>
          {/if}
          {#if schedule.lastRun}
            <Badge size="tiny" color="success">
              Ran <RelativeTime time={schedule.lastRun} />
            </Badge>
          {:else}
            <Badge size="tiny" color="secondary">Never run</Badge>
          {/if}
        </HStack>
      </Stack>

      <HStack class="grow justify-end">
        {#if schedule.paused}
          <IconButton onclick={onResume} aria-label="Resume" icon={mdiPlay} />
        {:else}
          <IconButton onclick={onPause} aria-label="Pause" icon={mdiPause} />
        {/if}
        <IconButton
          onclick={onConfigure}
          aria-label="Configure"
          icon={mdiCog}
        />
        <IconButton onclick={onDelete} aria-label="Delete" icon={mdiDelete} />
      </HStack>
    </HStack>

    <Stack class="pl-7 gap-3 pt-2">
      {#if schedule.repositories.length > 0}
        {#each schedule.repositories as repoId}
          <Text>
            {repositoryNames[repoId] ?? repoId}
          </Text>
        {/each}
      {:else}
        <Text color="secondary">No backups in this schedule.</Text>
      {/if}
    </Stack>
  </CardBody>
</Card>
