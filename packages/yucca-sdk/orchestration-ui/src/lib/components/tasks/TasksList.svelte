<script lang="ts">
  import type { SocketEvent } from "$lib/events";
  import {
    Badge,
    Button,
    Card,
    CardBody,
    CardFooter,
    Heading,
    modalManager,
  } from "@immich/ui";
  import { SvelteMap } from "svelte/reactivity";
  import OnEvents from "../util/OnEvents.svelte";
  import ViewLogModal from "../backups/dialogs/ViewLogModal.svelte";
  import { onMount } from "svelte";
  import type { RunningTaskDto } from "$lib/fetch-client";
  import { handleGetRunningTasks } from "$lib/services/task.service";
  import RelativeTime from "../util/RelativeTime.svelte";

  let tasks = new SvelteMap<
    string,
    RunningTaskDto & { completedAt?: string }
  >();

  onMount(() => {
    handleGetRunningTasks().then((data) => {
      for (const task of data.tasks) {
        tasks.set(task.parentId, task);
      }
    });
  });

  const onTaskStart = (event: SocketEvent<{ task: any }>) => {
    tasks.set(event.data.task.parentId, event.data.task);
  };

  const onTaskUpdate = (
    event: SocketEvent<{ parentId: string; task: any }>,
  ) => {
    tasks.set(event.data.parentId, {
      ...tasks.get(event.data.parentId),
      ...event.data.task,
    });
  };

  const onTaskEnd = (event: SocketEvent<{ parentId: string }>) => {
    tasks.set(event.data.parentId, {
      ...tasks.get(event.data.parentId)!,
      completedAt: new Date().toISOString(),
    });
  };

  const shouldDisplay = (task: RunningTaskDto) => {
    if (
      task.type === "backup" &&
      tasks
        .values()
        .some((entry) =>
          entry.scheduleStatus?.some(
            (entry) => entry.repositoryId === task.parentId,
          ),
        )
    ) {
      return false;
    }

    return true;
  };
</script>

<OnEvents {onTaskStart} {onTaskUpdate} {onTaskEnd} />

<div class="flex flex-col gap-2">
  <Heading>Active tasks</Heading>

  {#each tasks.values() as task (task.parentId)}
    {#if shouldDisplay(task)}
      <Card>
        <CardBody>
          {#if task.completedAt}Finished{:else}Running{/if}
          {task.type} task {#if task.completedAt}
            <Badge color="info" size="tiny"
              ><RelativeTime time={task.completedAt} /></Badge
            >
          {/if}
        </CardBody>
        {#if task.logId}
          <CardFooter>
            <Button
              onclick={() =>
                modalManager.open(ViewLogModal, {
                  logId: task.logId!,
                })}>View Log</Button
            >
          </CardFooter>
        {/if}
        {#if task.scheduleStatus}
          <!-- TODO: display schedule status -->
        {/if}
      </Card>
    {/if}
  {/each}

  {#if tasks.size === 0}
    No tasks currently running.
  {/if}
</div>
