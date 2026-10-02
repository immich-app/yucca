<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { Badge, Button, Card, Icon } from "@immich/ui";
  import { mdiProgressCheck } from "@mdi/js";
  import { getProvider } from "$lib/providers";
  import { getBackupOutcome } from "$lib/utils/backup-status";
  import Section from "../ui/Section.svelte";
  import StackListItem from "../ui/StackListItem.svelte";
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

<Section>
  {#snippet title()}
    {$t`Your backups`}
  {/snippet}

  {#snippet action()}
    {#if onViewBackups}
      <Button variant="ghost" size="small" onclick={onViewBackups}>
        {$t`View all`}
      </Button>
    {/if}
  {/snippet}

  <Card class="border-primary-100 shadow-none">
    <StackListItem title={$t`Backup health`}>
      {#snippet icon()}
        <Icon icon={mdiProgressCheck} />
      {/snippet}

      {$t`Status across all of your backups`}

      {#snippet trailing()}
        <Badge size="small" color="success">
          {$t({
            message: "{successful} of {total} successful",
            values: { successful: status.success, total },
          })}
        </Badge>
      {/snippet}
    </StackListItem>

    <div class="px-5 pb-5">
      <VisualisationSegmentedBar
        segments={[
          {
            value: status.success,
            label: $t`Successful`,
            color: "var(--immich-ui-success-500)",
          },
          {
            value: status.incomplete,
            label: $t`In-progress or incomplete`,
            color: "var(--immich-ui-info-400)",
          },
          {
            value: status.offline,
            label: $t`Offline`,
            color: "var(--immich-ui-warning-500)",
          },
          {
            value: status.warned,
            label: $t`With warnings`,
            color: "var(--immich-ui-warning-500)",
          },
          {
            value: status.failed,
            label: $t`Failed`,
            color: "var(--immich-ui-danger-500)",
          },
          {
            value: status.neverRun,
            label: $t`Never Run`,
            color: "var(--immich-ui-light-400)",
          },
        ]}
      />
    </div>
  </Card>
</Section>
