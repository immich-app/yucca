<script lang="ts">
  import { removeSchedule, type ScheduleDto } from "$lib/fetch-client";
  import {
    Badge,
    Card,
    CardBody,
    Heading,
    HStack,
    IconButton,
    Stack,
    Text,
    toastManager,
  } from "@immich/ui";
  import { mdiDelete } from "@mdi/js";
  import RelativeTime from "../util/RelativeTime.svelte";

  type Props = {
    schedule: ScheduleDto;
    repositoryNames: Record<string, string>;
  };

  const { schedule, repositoryNames }: Props = $props();

  const onDelete = async () => {
    try {
      await removeSchedule(schedule.id);
      toastManager.info(`Deleted schedule "${schedule.name}"`);
    } catch (error) {
      toastManager.danger(`Failed to delete schedule: ${error}`);
    }
  };
</script>

<Card color={schedule.paused ? "warning" : undefined}>
  <CardBody>
    <HStack>
      <Stack>
        <Heading>{schedule.name}</Heading>
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
