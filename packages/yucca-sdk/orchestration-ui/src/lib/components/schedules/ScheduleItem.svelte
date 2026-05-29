<script lang="ts">
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import type { ScheduleDto } from "$lib/fetch-client";
  import { getScheduleActions } from "$lib/services/schedule.service";
  import { Badge, HStack, Stack, Text } from "@immich/ui";

  type Props = {
    schedule: ScheduleDto;
    repositoryNames: Record<string, string>;
  };

  const { schedule, repositoryNames }: Props = $props();

  const { Resume, Pause, Configure, Delete } = $derived(
    getScheduleActions(schedule),
  );
</script>

<StackListItem actions={[Resume, Pause, Configure, Delete]}>
  <Stack gap={0} class="min-w-0">
    <HStack gap={1} class="items-baseline">
      <Text>{schedule.name}</Text>
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

    {#if schedule.repositories.length > 0}
      <Text size="small" color="secondary">
        {schedule.repositories
          .map((repositoryId) => repositoryNames[repositoryId] ?? repositoryId)
          .join(", ")}
      </Text>
    {:else}
      <Text size="small" color="secondary">No backups in this schedule.</Text>
    {/if}
  </Stack>
</StackListItem>
