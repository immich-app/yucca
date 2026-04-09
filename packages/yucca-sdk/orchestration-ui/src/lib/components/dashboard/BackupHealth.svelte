<script lang="ts">
  import { Alert, Text } from "@immich/ui";
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import SegmentedBar from "./visualisations/SegmentedBar.svelte";

  type Props = {
    repositories: LocalRepositoryDto[];
  };

  const { repositories }: Props = $props();

  const total = $derived(repositories.length);

  const status = $derived.by(() => {
    let success = 0;
    let failed = 0;
    let neverRun = 0;

    for (const repo of repositories) {
      if (!repo.metrics?.lastBackup) {
        neverRun++;
      } else if (
        repo.metrics.lastBackup === repo.metrics.lastSuccessfulBackup
      ) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed, neverRun };
  });

  const hasFailures = $derived(status.failed > 0);
  const allHealthy = $derived(
    total > 0 && status.failed === 0 && status.neverRun === 0,
  );
  const allNeverRun = $derived(
    total > 0 && status.success === 0 && status.failed === 0,
  );
</script>

{#if allNeverRun}
  <Alert color="info">
    <Text class="grow">{total} backups configured</Text>
  </Alert>
{:else if hasFailures}
  <Alert color="danger">
    <Text class="grow"
      >{status.failed} backups failed — check the Backups page for details</Text
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
