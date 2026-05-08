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

<PageLayout title="Backups" actions={[ViewRecoveryKey, Configure, BackUpNow]}>
  <Container size="large" center>
    {#if repository && schedule}
      <Stack class="mt-4" gap={8}>
        <ImmichManageBackupOverview {repository} {schedule} />
        <BackendsList {repository} />
        <RepositoryRunHistory {repository} />
        <RepositorySnapshotsList {repository} />
      </Stack>
    {/if}
  </Container>
</PageLayout>
