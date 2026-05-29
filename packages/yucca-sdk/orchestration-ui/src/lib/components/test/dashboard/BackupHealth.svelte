<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { Alert, Text } from "@immich/ui";
  import SegmentedBar from "../../ui/VisualisationSegmentedBar.svelte";

  type Props = {
    repositories: LocalRepositoryDto[];
  };

  const { repositories }: Props = $props();

  const total = $derived(repositories.length);

  const status = $derived(
    repositories.reduce(
      (tally, repo) => {
        if (!repo.backends?.primary.online) {
          tally.offline++;
        } else if (!repo.metrics?.lastBackup) {
          tally.neverRun++;
        } else if (
          repo.metrics.lastBackup === repo.metrics.lastSuccessfulBackup
        ) {
          tally.success++;
        } else {
          tally.failed++;
        }
        return tally;
      },
      { success: 0, offline: 0, failed: 0, neverRun: 0 },
    ),
  );

  const hasFailures = $derived(status.offline > 0 || status.failed > 0);
  const allHealthy = $derived(
    total > 0 &&
      status.offline === 0 &&
      status.failed === 0 &&
      status.neverRun === 0,
  );
  const allNeverRun = $derived(
    total > 0 &&
      status.success === 0 &&
      status.offline === 0 &&
      status.failed === 0,
  );
</script>

{#if allNeverRun}
  <Alert color="info">
    <Text class="grow">{total} backups configured</Text>
  </Alert>
{:else if hasFailures}
  <Alert color="danger">
    <Text class="grow"
      >{status.failed + status.offline} backups failed or offline — check the Backups
      page for details</Text
    >
  </Alert>
{:else if allHealthy}
  <Alert color="success">
    <Text class="grow">All {total} backups healthy</Text>
  </Alert>
{/if}

<SegmentedBar
  title="Backup Health"
  summary="{status.success} of {total} successful"
  segments={[
    {
      value: status.success,
      label: "Successful",
      color: "var(--immich-ui-success-500)",
      badge: "success",
    },
    {
      value: status.offline,
      label: "Offline",
      color: "var(--immich-ui-warning-500)",
      badge: "warning",
    },
    {
      value: status.failed,
      label: "Failed",
      color: "var(--immich-ui-danger-500)",
      badge: "danger",
    },
    {
      value: status.neverRun,
      label: "Never Run",
      color: "var(--immich-ui-light-400)",
      badge: "secondary",
    },
  ]}
/>
