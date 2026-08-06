<script lang="ts">
  import StackListItem from "$lib/components/ui/StackListItem.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import type { ScheduleDto } from "$lib/fetch-client";
  import { getScheduleActions } from "$lib/services/schedule.service";
  import { Badge, Icon } from "@immich/ui";
  import { mdiClockOutline } from "@mdi/js";

  type Props = {
    schedule: ScheduleDto;
    repositoryNames: Record<string, string>;
  };

  const { schedule, repositoryNames }: Props = $props();

  const { Resume, Pause, Configure, Delete } = $derived(
    getScheduleActions(schedule),
  );
</script>

<StackListItem
  title={schedule.name}
  color={schedule.paused ? "warning" : "primary"}
  actions={[Resume, Pause, Configure, Delete]}
>
  {#snippet icon()}
    <Icon icon={mdiClockOutline} />
  {/snippet}

  {#if schedule.repositories.length > 0}
    {schedule.repositories
      .map((repositoryId) => repositoryNames[repositoryId] ?? repositoryId)
      .join(", ")}
  {:else}
    No backups in this schedule.
  {/if}

  {#snippet trailing()}
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
  {/snippet}
</StackListItem>
