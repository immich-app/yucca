<script lang="ts">
  import { options } from "$lib/options";
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import {
    Alert,
    Button,
    Card,
    CardBody,
    Icon,
    LoadingSpinner,
    Stack,
    Text,
  } from "@immich/ui";
  import { mdiBackupRestore } from "@mdi/js";

  import {
    useIntegrationEventHandler,
    useIntegrations,
  } from "$lib/services/integrations.service";
  import {
    useRepositories,
    useRepositoryEventHandler,
  } from "$lib/services/repository.service";
  import {
    useScheduleEventHandler,
    useSchedules,
  } from "$lib/services/schedule.service";
  import ImmichIntegrationCard from "../integrations/immich/draft/ImmichIntegrationCard.svelte";
  import OnEvents from "../util/OnEvents.svelte";
  import ActiveJobs from "./ActiveJobs.svelte";
  import BackupHealth from "./BackupHealth.svelte";
  import BackupStats from "./BackupStats.svelte";
  import RecentBackups from "./RecentBackups.svelte";

  type Props = {
    onNavigate?: (route: string) => void;
  };

  const { advanced } = options;

  const { onNavigate }: Props = $props();

  const query = useRepositories();
  const integrationsQuery = useIntegrations();
  const schedulesQuery = useSchedules();
  const { onRepositoryCreate, onRepositoryUpdate } =
    useRepositoryEventHandler();
  const { onScheduleUpdate } = useScheduleEventHandler();
  const { onIntegrationUpdate } = useIntegrationEventHandler();
</script>

<OnEvents
  {onRepositoryCreate}
  {onRepositoryUpdate}
  {onScheduleUpdate}
  {onIntegrationUpdate}
/>

{#if query.isLoading}
  <LoadingSpinner />
{:else if query.isError}
  <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
{:else if query.isSuccess && query.data.length === 0}
  <Card>
    <CardBody>
      <div class="flex flex-col items-center gap-4 py-8">
        <Icon icon={mdiBackupRestore} size="48" color="muted" />
        <Stack class="items-center gap-1">
          <Text size="large">No backups configured yet</Text>
          <Text color="secondary" class="text-center max-w-md"
            >Once you set up a backup, this dashboard will show its health,
            schedule, and storage usage at a glance.</Text
          >
        </Stack>
        {#if onNavigate}
          <Button color="primary" onclick={() => onNavigate("backups")}
            >Set up your first backup</Button
          >
        {/if}
      </div>
    </CardBody>
  </Card>
{:else if query.isSuccess}
  {#if integrationsQuery.isSuccess && integrationsQuery.data.immichIntegration}
    <ImmichIntegrationCard
      schedule={schedulesQuery.data?.find(
        (schedule) =>
          schedule.id === integrationsQuery.data!.immichIntegration!.scheduleId,
      )}
      metrics={query.data.find(
        (repository) =>
          repository.id === integrationsQuery.data!.immichIntegration!.id,
      )?.metrics}
    />
  {:else if integrationsQuery.isSuccess && integrationsQuery.data.immichState}
    <ImmichIntegrationCard unconfigured />
  {/if}

  <BackupHealth repositories={query.data} />

  <BackupStats repositories={query.data} />

  <ActiveJobs />

  <RecentBackups
    repositories={query.data}
    onNavigate={onNavigate ? () => onNavigate("backups") : undefined}
  />
{/if}
