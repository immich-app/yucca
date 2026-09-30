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
  import { getProvider } from "$lib/providers";
  import { getBackupOutcome } from "$lib/utils/backup-status";
  import VisualisationSegmentedBar from "../ui/VisualisationSegmentedBar.svelte";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    repositories: LocalRepositoryDto[];
    onViewBackups?: () => void;
  };

  const { repositories, onViewBackups }: Props = $props();

  const local = getProvider().api === "orchestrator";

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
          case "incomplete": {
            tally.incomplete++;
            break;
          }
          default: {
            tally.success++;
            break;
          }
        }

        return tally;
      },
      { success: 0, offline: 0, warned: 0, failed: 0, incomplete: 0, neverRun: 0 },
    ),
  );
</script>

<Card class="border-primary-100 shadow-none">
  <CardHeader>
    <HStack class="justify-between">
      <CardTitle tag="h2">{$t`Your Backups`}</CardTitle>
      {#if onViewBackups}
        <Button variant="outline" size="tiny" onclick={onViewBackups}>
          {$t`View all`}
        </Button>
      {/if}
    </HStack>
  </CardHeader>
  <CardBody>
    <VisualisationSegmentedBar
      title={$t`Backup Health`}
      summary={$t({
        message: "{successful} of {total} successful",
        values: { successful: status.success, total },
      })}
      segments={[
        {
          value: status.success,
          label: $t`Successful`,
          color: "var(--immich-ui-success-500)",
          badge: "success",
        },
        {
          value: status.incomplete,
          label: $t`In-progress or incomplete`,
          color: "var(--immich-ui-info-400)",
          badge: "info",
        },
        {
          value: status.offline,
          label: $t`Offline`,
          color: "var(--immich-ui-warning-500)",
          badge: "warning",
        },
        {
          value: status.warned,
          label: $t`With warnings`,
          color: "var(--immich-ui-warning-500)",
          badge: "warning",
        },
        {
          value: status.failed,
          label: $t`Failed`,
          color: "var(--immich-ui-danger-500)",
          badge: "danger",
        },
        {
          value: status.neverRun,
          label: $t`Never Run`,
          color: "var(--immich-ui-light-400)",
          badge: "secondary",
        },
      ]}
    />
  </CardBody>
</Card>
