<script lang="ts">
  import BackendsList from "$lib/components/backends/BackendsList.svelte";
  import RepositoryRunHistory from "$lib/components/backups/run-history/RepositoryRunHistory.svelte";
  import RepositorySnapshotsList from "$lib/components/backups/snapshots-list/RepositorySnapshotsList.svelte";
  import PageLayout from "$lib/components/ui/PageLayout.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import { getBackupPageActions } from "$lib/services/immich.integration.service";
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
  import RepositoryRunHistoryPage from "$lib/components/backups/run-history/RepositoryRunHistoryPage.svelte";
  import RepositorySnapshotsPage from "$lib/components/backups/snapshots-list/RepositorySnapshotsPage.svelte";
  import { Container, Stack } from "@immich/ui";
  import ImmichManageBackupOverview from "./ImmichManageBackupOverview.svelte";

  const schedules = useSchedules();
  const repositories = useRepositories();
  const integrations = useIntegrations();

  const { onScheduleCreate, onScheduleUpdate, onScheduleDelete } =
    useScheduleEventHandler();
  const { onRepositoryCreate, onRepositoryUpdate, onRepositoryDelete } =
    useRepositoryEventHandler();
  const { onIntegrationUpdate } = useIntegrationEventHandler();

  const schedule = $derived(
    integrations.data?.immichIntegration
      ? schedules.data?.find(
          (schedule) =>
            schedule.id === integrations.data.immichIntegration!.scheduleId,
        )
      : undefined,
  );

  const repository = $derived(
    integrations.data?.immichIntegration
      ? repositories.data?.find(
          (repository) =>
            repository.id === integrations.data.immichIntegration!.id,
        )
      : undefined,
  );

  const { ViewRecoveryKey, Configure, BackUpNow } = $derived(
    getBackupPageActions(repository?.id),
  );

  let view = $state<"overview" | "attempts" | "snapshots">("overview");
</script>

<OnEvents
  {onScheduleCreate}
  {onScheduleUpdate}
  {onScheduleDelete}
  {onRepositoryCreate}
  {onRepositoryUpdate}
  {onRepositoryDelete}
  {onIntegrationUpdate}
/>

{#if view === "attempts" && repository}
  <PageLayout title="Backup attempts" onBack={() => (view = "overview")}>
    <Container size="medium" center>
      <div class="mt-4">
        <RepositoryRunHistoryPage {repository} />
      </div>
    </Container>
  </PageLayout>
{:else if view === "snapshots" && repository}
  <PageLayout title="Snapshots" onBack={() => (view = "overview")}>
    <Container size="medium" center>
      <div class="mt-4">
        <RepositorySnapshotsPage {repository} immich />
      </div>
    </Container>
  </PageLayout>
{:else}
  <PageLayout title="Backups" actions={[ViewRecoveryKey, Configure, BackUpNow]}>
    <Container size="medium" center>
      {#if repository && schedule}
        <Stack class="mt-4" gap={6}>
          <ImmichManageBackupOverview {repository} {schedule} />
          <BackendsList {repository} />
          <RepositoryRunHistory
            {repository}
            onViewAll={() => (view = "attempts")}
          />
          <RepositorySnapshotsList
            {repository}
            immich
            limit={5}
            onViewAll={() => (view = "snapshots")}
          />
        </Stack>
      {/if}
    </Container>
  </PageLayout>
{/if}
