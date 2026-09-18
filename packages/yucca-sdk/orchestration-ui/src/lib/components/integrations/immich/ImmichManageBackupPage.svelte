<script lang="ts">
  import BackendsList from "$lib/components/backends/BackendsList.svelte";
  import RepositoryRunHistory from "$lib/components/backups/run-history/RepositoryRunHistory.svelte";
  import RepositorySnapshotsList from "$lib/components/backups/snapshots-list/RepositorySnapshotsList.svelte";
  import PageLayout from "$lib/components/ui/PageLayout.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import {
    getBackupPageActions,
    useImmichBackupStatus,
    useImmichBackupStatusEventHandler,
  } from "$lib/services/immich.integration.service";
  import { Container, Stack } from "@immich/ui";
  import ImmichManageBackupOverview from "./ImmichManageBackupOverview.svelte";

  type Props = {
    onConfigure: () => void;
    onViewAttempts: () => void;
    onViewSnapshots: () => void;
  };

  const { onConfigure, onViewAttempts, onViewSnapshots }: Props = $props();

  const backup = useImmichBackupStatus();

  const { repository, schedule } = $derived(backup);

  const { ViewRecoveryKey, Configure } = $derived(
    getBackupPageActions(repository?.id, onConfigure),
  );
</script>

<OnEvents {...useImmichBackupStatusEventHandler()} />

<PageLayout title="Backups" actions={[ViewRecoveryKey, Configure]}>
  <Container size="medium" center>
    {#if repository && schedule}
      <Stack class="mt-4" gap={6}>
        <ImmichManageBackupOverview {repository} {schedule} status={backup.status} />
        <BackendsList {repository} />
        <RepositoryRunHistory {repository} onViewAll={onViewAttempts} />
        <RepositorySnapshotsList
          {repository}
          immich
          limit={5}
          onViewAll={onViewSnapshots}
        />
      </Stack>
    {/if}
  </Container>
</PageLayout>
