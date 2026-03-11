<script lang="ts">
  /* SLOP FILE */

  import type { SocketEvent } from "$lib/events";
  import type {
    RunningTaskDto,
    LocalRepositoryDto,
    ScheduleDto,
  } from "$lib/fetch-client";
  import { handleGetRunningTasks } from "$lib/services/task.service";
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
    Stack,
    Text,
  } from "@immich/ui";
  import {
    mdiAlertCircleOutline,
    mdiCancel,
    mdiCheckCircleOutline,
    mdiClockOutline,
    mdiClose,
    mdiLoading,
    mdiTextBoxOutline,
  } from "@mdi/js";
  import { onDestroy, onMount } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import OnEvents from "../util/OnEvents.svelte";
  import ViewLogModal from "../backups/dialogs/ViewLogModal.svelte";
  import { sdk } from "$lib";

  type LiveTask = RunningTaskDto & { completedAt?: string };

  let tasks = new SvelteMap<string, LiveTask>();
  let repositories = new SvelteMap<string, LocalRepositoryDto>();
  let schedules = new SvelteMap<string, ScheduleDto>();
  const logObservers = new Map<string, ReturnType<typeof createLogObserver>>();

  const getRepoName = (id: string) => repositories.get(id)?.name ?? id;
  const getScheduleName = (id: string) => schedules.get(id)?.name ?? id;

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

  onMount(async () => {
    const [taskData, repoData, scheduleData] = await Promise.all([
      handleGetRunningTasks(),
      sdk.getRepositories(),
      sdk.getSchedules(),
    ]);

    for (const repo of repoData.repositories) {
      repositories.set(repo.id, repo);
    }
    for (const schedule of scheduleData.schedules) {
      schedules.set(schedule.id, schedule);
    }
    for (const task of taskData.tasks) {
      tasks.set(task.parentId, task);
    }
  });

  onDestroy(() => {
    for (const observer of logObservers.values()) {
      observer.destroy();
    }
  });

  const onTaskStart = (event: SocketEvent<{ task: RunningTaskDto }>) => {
    tasks.set(event.data.task.parentId, event.data.task);
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
    const existing = tasks.get(event.data.parentId);
    if (existing) {
      // Clean up log observer
      if (existing.logId && logObservers.has(existing.logId)) {
        logObservers.get(existing.logId)!.destroy();
        logObservers.delete(existing.logId);
      }
      tasks.set(event.data.parentId, {
        ...existing,
        completedAt: new Date().toISOString(),
      });
    }
  };

  const shouldDisplay = (task: LiveTask) => {
    // Hide individual backup tasks that are part of a schedule
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
    modalManager.open(ViewLogModal, { logId });
  };
</script>

<OnEvents {onTaskStart} {onTaskUpdate} {onTaskEnd} />

<Stack>
  {#each tasks.values() as task (task.parentId)}
    {#if shouldDisplay(task)}
      {#if task.type === "backup" && !task.completedAt}
        {@const log = getLogStatus(task.logId)}
        <Card>
          <CardBody class="flex flex-col gap-2">
            <HStack class="items-center justify-between">
              <HStack class="items-center gap-3">
                <Icon
                  icon={mdiLoading}
                  size="18"
                  class="animate-spin opacity-60"
                />
                <Text>
                  Backing up <strong>{getRepoName(task.parentId)}</strong>
                </Text>
                {#if log && log.progress > 0}
                  <Badge size="tiny" color="warning"
                    >{Math.round(log.progress * 100)}%</Badge
                  >
                {/if}
              </HStack>
              <HStack class="gap-2">
                {#if task.logId}
                  <Button
                    size="tiny"
                    variant="ghost"
                    onclick={() => openLog(task.logId!)}
                  >
                    <Icon icon={mdiTextBoxOutline} size="14" />
                    Log
                  </Button>
                {/if}
                <Button size="tiny" color="danger" variant="outline">
                  <Icon icon={mdiCancel} size="14" />
                  Cancel
                </Button>
              </HStack>
            </HStack>
            {#if log && log.progress > 0}
              <ProgressBar progress={log.progress} size="small" />
            {/if}
          </CardBody>
        </Card>
      {:else if task.type === "schedule" && !task.completedAt}
        <Card>
          <CardBody class="flex flex-col gap-3">
            <HStack class="items-center justify-between">
              <HStack class="items-center gap-3">
                <Icon
                  icon={mdiLoading}
                  size="18"
                  class="animate-spin opacity-60"
                />
                <Text>
                  Running <strong>{getScheduleName(task.parentId)}</strong> schedule
                </Text>
              </HStack>
              <Button size="tiny" color="danger" variant="outline">
                <Icon icon={mdiClose} size="14" />
                Cancel All
              </Button>
            </HStack>

            {#if task.scheduleStatus}
              <Stack class="pl-7 gap-2">
                {#each task.scheduleStatus as item}
                  {@const subTask = tasks.get(item.repositoryId)}
                  {@const subLog = subTask?.logId
                    ? getLogStatus(subTask.logId)
                    : undefined}

                  {#if item.status === "complete"}
                    <HStack class="items-center justify-between">
                      <HStack class="items-center gap-2">
                        <Icon
                          icon={mdiCheckCircleOutline}
                          size="16"
                          class="text-green-500"
                        />
                        <Text class="text-sm"
                          >{getRepoName(item.repositoryId)}</Text
                        >
                        <Badge size="tiny" color="success">Success</Badge>
                      </HStack>
                      {#if subTask?.logId}
                        <Button
                          size="tiny"
                          variant="ghost"
                          onclick={() => openLog(subTask.logId!)}
                        >
                          <Icon icon={mdiTextBoxOutline} size="14" />
                          Log
                        </Button>
                      {/if}
                    </HStack>
                  {:else if item.status === "failed"}
                    <HStack class="items-center justify-between">
                      <HStack class="items-center gap-2">
                        <Icon
                          icon={mdiAlertCircleOutline}
                          size="16"
                          class="text-red-500"
                        />
                        <Text class="text-sm"
                          >{getRepoName(item.repositoryId)}</Text
                        >
                        <Badge size="tiny" color="danger">Failed</Badge>
                      </HStack>
                      {#if subTask?.logId}
                        <Button
                          size="tiny"
                          variant="ghost"
                          onclick={() => openLog(subTask.logId!)}
                        >
                          <Icon icon={mdiTextBoxOutline} size="14" />
                          Log
                        </Button>
                      {/if}
                    </HStack>
                  {:else if subLog && subLog.progress > 0}
                    <div class="flex flex-col gap-1">
                      <HStack class="items-center justify-between">
                        <HStack class="items-center gap-2">
                          <Icon
                            icon={mdiLoading}
                            size="16"
                            class="animate-spin opacity-60"
                          />
                          <Text class="text-sm"
                            >{getRepoName(item.repositoryId)}</Text
                          >
                          <Badge size="tiny" color="warning"
                            >{Math.round(subLog.progress * 100)}%</Badge
                          >
                        </HStack>
                        <HStack class="gap-2">
                          {#if subTask?.logId}
                            <Button
                              size="tiny"
                              variant="ghost"
                              onclick={() => openLog(subTask.logId!)}
                            >
                              <Icon icon={mdiTextBoxOutline} size="14" />
                              Log
                            </Button>
                          {/if}
                          <Button size="tiny" color="danger" variant="ghost"
                            >Cancel</Button
                          >
                        </HStack>
                      </HStack>
                      <div class="pl-6">
                        <ProgressBar progress={subLog.progress} size="small" />
                      </div>
                    </div>
                  {:else}
                    <HStack class="items-center gap-2">
                      <Icon
                        icon={mdiClockOutline}
                        size="16"
                        class="opacity-40"
                      />
                      <Text class="text-sm opacity-60"
                        >{getRepoName(item.repositoryId)}</Text
                      >
                      <Badge size="tiny">Queued</Badge>
                    </HStack>
                  {/if}
                {/each}
              </Stack>
            {/if}
          </CardBody>
        </Card>
      {:else if task.completedAt}
        <Card>
          <CardBody>
            <HStack class="items-center justify-between">
              <HStack class="items-center gap-3">
                <Icon
                  icon={mdiCheckCircleOutline}
                  size="18"
                  class="text-green-500"
                />
                <Text>
                  Finished {task.type}
                  {#if task.type === "backup"}
                    <strong>{getRepoName(task.parentId)}</strong>
                  {:else if task.type === "schedule"}
                    <strong>{getScheduleName(task.parentId)}</strong>
                  {/if}
                </Text>
              </HStack>
              {#if task.logId}
                <Button
                  size="tiny"
                  variant="ghost"
                  onclick={() => openLog(task.logId!)}
                >
                  <Icon icon={mdiTextBoxOutline} size="14" />
                  Log
                </Button>
              {/if}
            </HStack>
          </CardBody>
        </Card>
      {/if}
    {/if}
  {/each}

  {#if tasks.size === 0}
    <Text class="opacity-60">No active tasks.</Text>
  {/if}
</Stack>
