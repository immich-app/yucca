<script lang="ts">
  import type { SocketEvent } from "$lib/events";
  import {
    Button,
    Card,
    CardBody,
    CardFooter,
    Heading,
    modalManager,
  } from "@immich/ui";
  import { SvelteMap } from "svelte/reactivity";
  import OnEvents from "../OnEvents.svelte";
  import ViewLogModal from "../backups/dialogs/ViewLogModal.svelte";

  let tasks = new SvelteMap<
    string,
    { parentId: string; type: string; logId?: string }
  >();

  const onTaskStart = (event: SocketEvent<{ task: any }>) => {
    tasks.set(event.data.task.parentId, event.data.task);
  };

  const onTaskEnd = (event: SocketEvent<{ parentId: string }>) => {
    tasks.delete(event.data.parentId);
  };
</script>

<OnEvents {onTaskStart} {onTaskEnd} />

<div class="flex flex-col gap-2">
  <Heading>Active tasks</Heading>

  {#each tasks.values() as task (task.parentId)}
    <Card>
      <CardBody>
        Running {task.type} task
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
    </Card>
  {/each}

  {#if tasks.size === 0}
    No tasks currently running.
  {/if}
</div>
