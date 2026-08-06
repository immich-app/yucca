<script lang="ts">
  import type { SocketEvent } from "$lib/events";
  import type { RunningTaskDto } from "$lib/fetch-client";
  import {
    handleCancelTask,
    handleGetRunningTasks,
  } from "$lib/services/task.service";
  import { useRepositories } from "$lib/services/repository.service";
  import { useSchedules } from "$lib/services/schedule.service";
  import {
    createLogObserver,
    type LogStatus,
  } from "$lib/services/log.service.svelte";
  import {
    Badge,
    Button,
    Card,
    CardBody,
    HStack,
    Icon,
    modalManager,
    ProgressBar,
    Text,
  } from "@immich/ui";
  import {
    mdiAlertCircleOutline,
    mdiCheckCircleOutline,
    mdiClockOutline,
    mdiLoading,
    mdiStopCircleOutline,
    mdiTextBoxOutline,
  } from "@mdi/js";
  import { onDestroy, onMount } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import OnEvents from "../../util/OnEvents.svelte";
  import RelativeTime from "../../util/RelativeTime.svelte";
  import ViewStatusModal from "../../backups/dialogs/ViewStatusModal.svelte";

  const LINGER_MS = 3000;
  const FADE_MS = 600;

  type LiveTask = RunningTaskDto & {
    startedAt: string;
    completedAt?: string;
    fading?: boolean;
  };

  let tasks = new SvelteMap<string, LiveTask>();

  const repositoriesQuery = useRepositories();
  const schedulesQuery = useSchedules();

  const logObservers = new Map<string, ReturnType<typeof createLogObserver>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>[]>();

  const getRepoName = (id: string) =>
    repositoriesQuery.data?.find((repository) => repository.id === id)?.name ??
    id;
  const getScheduleName = (id: string) =>
    schedulesQuery.data?.find((schedule) => schedule.id === id)?.name ?? id;

  const ensureLogObserver = (logId: string) => {
    if (!logObservers.has(logId)) {
      logObservers.set(logId, createLogObserver(logId));
    }

    return logObservers.get(logId)!;
  };

  $effect(() => {
    for (const task of tasks.values()) {
      if (task.logId && !task.completedAt) {
        ensureLogObserver(task.logId);
      }
    }
  });

  const getLogStatus = (logId?: string): LogStatus | undefined => {
    if (!logId) return undefined;
    return logObservers.get(logId)?.status;
  };

  const taskName = (task: LiveTask) =>
    task.type === "schedule"
      ? getScheduleName(task.parentId)
      : getRepoName(task.parentId);

  const hasFailedItems = (task: LiveTask) =>
    task.scheduleStatus?.some((item) => item.status === "failed") ?? false;

  const statusColor = (task: LiveTask) =>
    !task.completedAt
      ? "var(--immich-ui-warning-500)"
      : hasFailedItems(task)
        ? "var(--immich-ui-danger-500)"
        : "var(--immich-ui-success-500)";

  onMount(async () => {
    const taskData = await handleGetRunningTasks();

    const now = new Date().toISOString();
    for (const task of taskData.tasks) {
      tasks.set(task.parentId, { ...task, startedAt: now });
    }
  });

  onDestroy(() => {
    for (const observer of logObservers.values()) {
      observer.destroy();
    }
    for (const bucket of timers.values()) {
      for (const timer of bucket) clearTimeout(timer);
    }
  });

  const onTaskStart = (event: SocketEvent<{ task: RunningTaskDto }>) => {
    const task = event.data.task;
    tasks.set(task.parentId, {
      ...task,
      startedAt: new Date().toISOString(),
    });
  };

  const onTaskUpdate = (
    event: SocketEvent<{ parentId: string; task: Partial<RunningTaskDto> }>,
  ) => {
    const existing = tasks.get(event.data.parentId);
    if (existing) {
      tasks.set(event.data.parentId, { ...existing, ...event.data.task });
    }
  };

  const onTaskEnd = (event: SocketEvent<{ parentId: string }>) => {
    const id = event.data.parentId;
    const existing = tasks.get(id);
    if (!existing) return;

    if (existing.logId && logObservers.has(existing.logId)) {
      logObservers.get(existing.logId)!.destroy();
      logObservers.delete(existing.logId);
    }

    tasks.set(id, { ...existing, completedAt: new Date().toISOString() });

    const lingerTimer = setTimeout(() => {
      const task = tasks.get(id);
      if (task) {
        tasks.set(id, { ...task, fading: true });
      }
      const fadeTimer = setTimeout(() => tasks.delete(id), FADE_MS);
      bucket.push(fadeTimer);
    }, LINGER_MS);
    const bucket = [lingerTimer];
    timers.set(id, bucket);
  };

  const shouldDisplay = (task: LiveTask) => {
    if (
      task.type === "backup" &&
      tasks
        .values()
        .some((entry) =>
          entry.scheduleStatus?.some(
            (item) => item.repositoryId === task.parentId,
          ),
        )
    ) {
      return false;
    }
    return true;
  };

  const openLog = (logId: string) => {
    modalManager.open(ViewStatusModal, { logId });
  };

  const onCancel = (parentId: string) => handleCancelTask(parentId);
</script>

<OnEvents {onTaskStart} {onTaskUpdate} {onTaskEnd} />

{#snippet logButton(logId: string | undefined)}
  {#if logId}
    <Button size="tiny" variant="ghost" onclick={() => openLog(logId)}>
      <Icon icon={mdiTextBoxOutline} size="14" />
      Log
    </Button>
  {/if}
{/snippet}

{#snippet scheduleItems(task: LiveTask, compact: boolean)}
  {#if task.scheduleStatus}
    <div class="flex flex-col gap-2 pl-7">
      {#each task.scheduleStatus as item (item.repositoryId)}
        {@const subTask = compact ? undefined : tasks.get(item.repositoryId)}
        {@const subLog =
          !compact && subTask?.logId ? getLogStatus(subTask.logId) : undefined}
        <div class="flex flex-col gap-1">
          <HStack class="items-center justify-between">
            <HStack class="items-center gap-2">
              {#if item.status === "complete"}
                <Icon
                  icon={mdiCheckCircleOutline}
                  size="16"
                  class="text-green-500"
                />
              {:else if item.status === "failed"}
                <Icon
                  icon={mdiAlertCircleOutline}
                  size="16"
                  class="text-danger-500"
                />
              {:else if subLog && subLog.progress > 0}
                <Icon
                  icon={mdiLoading}
                  size="16"
                  class="animate-spin opacity-60"
                />
              {:else}
                <Icon icon={mdiClockOutline} size="16" class="opacity-40" />
              {/if}
              <Text
                size="small"
                color={item.status === "incomplete" &&
                !(subLog && subLog.progress > 0)
                  ? "secondary"
                  : undefined}
              >
                {getRepoName(item.repositoryId)}
              </Text>
              {#if item.status === "complete"}
                <Badge size="tiny" color="success">Done</Badge>
              {:else if item.status === "failed"}
                <Badge size="tiny" color="danger">Failed</Badge>
              {:else if subLog && subLog.progress > 0}
                <Badge size="tiny" color="warning"
                  >{Math.round(subLog.progress * 100)}%</Badge
                >
              {:else}
                <Badge size="tiny">Queued</Badge>
              {/if}
            </HStack>
            {#if !compact}
              <HStack class="items-center gap-2">
                {@render logButton(subTask?.logId)}
                {#if subTask && !subTask.completedAt}
                  <Button
                    size="tiny"
                    variant="ghost"
                    color="danger"
                    onclick={() => onCancel(item.repositoryId)}
                  >
                    <Icon icon={mdiStopCircleOutline} size="14" />
                    Cancel
                  </Button>
                {/if}
              </HStack>
            {/if}
          </HStack>
          {#if !compact && subLog && subLog.progress > 0}
            <div class="pl-6">
              <ProgressBar progress={subLog.progress} size="small" />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

{#each tasks.values() as task (task.parentId)}
  {#if shouldDisplay(task)}
    <div class="task-card" class:task-card-fading={task.fading}>
      <Card style="background: color-mix(in oklch, {statusColor(task)}, transparent 92%);">
        <CardBody class="flex flex-col gap-3">
          <HStack class="items-center justify-between">
            <HStack class="items-center gap-3">
              {#if task.completedAt}
                <Icon
                  icon={hasFailedItems(task)
                    ? mdiAlertCircleOutline
                    : mdiCheckCircleOutline}
                  size="18"
                  class={hasFailedItems(task)
                    ? "text-danger-500"
                    : "text-green-500"}
                />
              {:else}
                <Icon
                  icon={mdiLoading}
                  size="18"
                  class="animate-spin opacity-60"
                />
              {/if}
              <Text>
                {#if task.completedAt}
                  {#if task.type === "schedule"}Finished schedule{:else if task.type === "forget"}Finished pruning{:else}Finished
                    backup{/if}
                {:else if task.type === "schedule"}Running schedule{:else if task.type === "forget"}Pruning{:else}Backing
                  up{/if}
                — <strong>{taskName(task)}</strong>
              </Text>
              {#if !task.completedAt && task.type === "backup"}
                {@const log = getLogStatus(task.logId)}
                {#if log && log.progress > 0}
                  <Badge size="tiny" color="warning"
                    >{Math.round(log.progress * 100)}%</Badge
                  >
                {/if}
              {/if}
            </HStack>
            <HStack class="items-center gap-2">
              <Text color="secondary" size="tiny">
                {#if task.completedAt}
                  <RelativeTime time={task.completedAt} />
                {:else}
                  Started <RelativeTime time={task.startedAt} />
                {/if}
              </Text>
              {@render logButton(task.logId)}
              {#if !task.completedAt}
                <Button
                  size="tiny"
                  variant="ghost"
                  color="danger"
                  onclick={() => onCancel(task.parentId)}
                >
                  <Icon icon={mdiStopCircleOutline} size="14" />
                  Cancel
                </Button>
              {/if}
            </HStack>
          </HStack>

          {#if task.type === "schedule" && task.scheduleStatus}
            {#if task.completedAt}
              {@render scheduleItems(task, true)}
            {:else}
              {@render scheduleItems(task, false)}
            {/if}
          {/if}

          {#if !task.completedAt && task.type === "backup"}
            {@const log = getLogStatus(task.logId)}
            {#if log && log.progress > 0}
              <ProgressBar progress={log.progress} size="small" />
            {/if}
          {/if}
        </CardBody>
      </Card>
    </div>
  {/if}
{/each}

<style>
  .task-card {
    opacity: 1;
    transform: translateY(0);
    transition-property: opacity, transform;
    transition-duration: 600ms;
    transition-timing-function: ease-out;
    animation: task-enter 300ms ease-out;
  }

  .task-card-fading {
    opacity: 0;
    transform: translateY(-8px);
  }

  @keyframes task-enter {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
