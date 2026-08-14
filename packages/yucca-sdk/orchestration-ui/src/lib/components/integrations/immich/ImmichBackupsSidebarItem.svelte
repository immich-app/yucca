<script lang="ts">
  import OnEvents from "$lib/components/util/OnEvents.svelte";
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
  import { getBackupOutcome } from "$lib/utils/backup-status";
  import ImmichBackupsCard from "./ImmichBackupsCard.svelte";

  type Props = {
    href?: string;
    onclick?: () => void;
    class?: string;
  };

  const { href = "/backups", onclick, class: className }: Props = $props();

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

  const outcome = $derived(getBackupOutcome(repository?.metrics));

  const loading = $derived(
    integrations.isLoading || repositories.isLoading || schedules.isLoading,
  );
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
  <ImmichBackupsCard
    {href}
    {outcome}
    {paused}
    {onclick}
    {lastBackup}
    class={className}
    configured={Boolean(repository)}
    running={latestBackupRun?.status === "incomplete"}
  />
{/if}
