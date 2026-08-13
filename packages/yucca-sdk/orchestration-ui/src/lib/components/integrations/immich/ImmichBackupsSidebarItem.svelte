<script lang="ts">
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import {
    useIntegrationEventHandler,
    useIntegrations,
  } from "$lib/services/integrations.service";
  import {
    useRepositories,
    useRepositoryEventHandler,
  } from "$lib/services/repository.service";
  import {
    useRunEventHandler,
    useRunHistory,
  } from "$lib/services/runHistory.service";
  import {
    useScheduleEventHandler,
    useSchedules,
  } from "$lib/services/schedule.service";
  import { HStack, Icon, Text } from "@immich/ui";
  import {
    mdiChevronRight,
    mdiCloudAlertOutline,
    mdiCloudCheckVariantOutline,
    mdiCloudOffOutline,
    mdiCloudUploadOutline,
  } from "@mdi/js";

  type Color = "primary" | "success" | "warning" | "danger";

  type Props = {
    href: string;
  };

  const { href }: Props = $props();

  // TODO: this should probably be condensed into one big request - since this loads on every initial Immich page load (in the future)

  const integrations = useIntegrations();
  const repositories = useRepositories();
  const schedules = useSchedules();

  const { onIntegrationUpdate } = useIntegrationEventHandler();
  const { onRepositoryCreate, onRepositoryUpdate, onRepositoryDelete } =
    useRepositoryEventHandler();
  const { onScheduleCreate, onScheduleUpdate, onScheduleDelete } =
    useScheduleEventHandler();
  const { onRunCreate, onRunUpdate } = useRunEventHandler();

  const integration = $derived(integrations.data?.immichIntegration);

  const repository = $derived(
    integration
      ? repositories.data?.find((entry) => entry.id === integration.id)
      : undefined,
  );

  const runHistory = useRunHistory(() => repository?.id);

  const latestBackupRun = $derived(
    runHistory.data?.find(
      (run) => run.type === "backup" || run.type === "schedule",
    ),
  );

  const paused = $derived(
    Boolean(
      integration &&
      schedules.data?.find((entry) => entry.id === integration.scheduleId)
        ?.paused,
    ),
  );

  const lastBackup = $derived(repository?.metrics.lastBackup ?? undefined);

  const failed = $derived(
    Boolean(
      lastBackup && lastBackup !== repository?.metrics.lastSuccessfulBackup,
    ),
  );

  const loading = $derived(
    integrations.isLoading || repositories.isLoading || schedules.isLoading,
  );

  const configured = $derived(Boolean(repository));
  const running = $derived(latestBackupRun?.status === "incomplete");

  const status = $derived.by(() => {
    if (running) {
      return { color: "primary", icon: mdiCloudUploadOutline } as const;
    }

    if (failed) {
      return { color: "danger", icon: mdiCloudOffOutline } as const;
    }

    if (paused) {
      return { color: "warning", icon: mdiCloudAlertOutline } as const;
    }

    if (!configured || !lastBackup) {
      return { color: "warning", icon: mdiCloudOffOutline } as const;
    }

    return { color: "success", icon: mdiCloudCheckVariantOutline } as const;
  });

  const tints: Record<Color, string> = {
    primary: "bg-primary-50 text-primary",
    success: "bg-success-50 text-success-700",
    warning: "bg-warning-50 text-warning-800",
    danger: "bg-danger-50 text-danger-700",
  };
</script>

<OnEvents
  {onIntegrationUpdate}
  {onRepositoryCreate}
  {onRepositoryUpdate}
  {onRepositoryDelete}
  {onScheduleCreate}
  {onScheduleUpdate}
  {onScheduleDelete}
  {onRunCreate}
  {onRunUpdate}
/>

{#if !loading}
  <a
    {href}
    class="flex w-full cursor-pointer items-center gap-2 px-3 py-3 text-start text-sm {tints[
      status.color
    ]}"
  >
    <Icon color={status.color} icon={status.icon} size="1.25em" class="shrink-0" />

    <Text size="tiny" color={status.color} class="flex-1 truncate">
      {#if running}
        Backing up now
      {:else if failed}
        Backup failed
      {:else if paused}
        Backups paused
      {:else if !configured}
        Not backed up
      {:else if lastBackup}
        Last backup <RelativeTime time={lastBackup} />
      {:else}
        Finish setting up backups
      {/if}
    </Text>

    <HStack gap={0}>
      {#if !configured}
        <Text size="tiny" color="primary" class="shrink-0">Set up</Text>
      {/if}

      <Icon
        color={configured ? status.color : "primary5"}
        icon={mdiChevronRight}
        size="1.25em"
        class="shrink-0"
      />
    </HStack>
  </a>
{/if}
