<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import {
    Button,
    Card,
    CardBody,
    CardHeader,
    CardTitle,
    HStack,
  } from "@immich/ui";
  import { getBackupOutcome } from "$lib/utils/backup-status";
  import VisualisationSegmentedBar from "../ui/VisualisationSegmentedBar.svelte";

  type Props = {
    repositories: LocalRepositoryDto[];
    local?: boolean;
    onViewBackups?: () => void;
  };

  const { repositories, local, onViewBackups }: Props = $props();

  const total = $derived(repositories.length);

  const status = $derived(
    repositories.reduce(
      (tally, repo) => {
        if (local && !repo.backends?.primary.online) {
          tally.offline++;
          return tally;
        }

        switch (getBackupOutcome(repo.metrics)) {
          case "never": {
            tally.neverRun++;
            break;
          }
          case "failed": {
            tally.failed++;
            break;
          }
          case "warn": {
            tally.warned++;
            break;
          }
          default: {
            tally.success++;
            break;
          }
        }

        return tally;
      },
      { success: 0, offline: 0, warned: 0, failed: 0, neverRun: 0 },
    ),
  );
</script>

<Card class="border-primary-100 shadow-none">
  <CardHeader>
    <HStack class="justify-between">
      <CardTitle>Your Backups</CardTitle>
      {#if onViewBackups}
        <Button variant="outline" size="tiny" onclick={onViewBackups}>
          View all
        </Button>
      {/if}
    </HStack>
  </CardHeader>
  <CardBody>
    <VisualisationSegmentedBar
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
          value: status.warned,
          label: "With warnings",
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
  </CardBody>
</Card>
