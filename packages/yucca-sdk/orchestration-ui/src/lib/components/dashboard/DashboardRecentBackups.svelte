<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { Icon, modalManager, type ActionItem } from "@immich/ui";
  import {
    mdiCloudCheckOutline,
    mdiCloudOffOutline,
    mdiHistory,
  } from "@mdi/js";
  import { getProvider } from "$lib/providers";
  import { getBackupOutcome } from "$lib/utils/backup-status";
  import MetricsHistoryModal from "../backups/metrics-history/MetricsHistoryModal.svelte";
  import StackList from "../ui/StackList.svelte";
  import StackListPlaceholder from "../ui/StackListPlaceholder.svelte";
  import StackListItem from "../ui/StackListItem.svelte";
  import RelativeTime from "../util/RelativeTime.svelte";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    repositories: LocalRepositoryDto[];
  };

  const { repositories }: Props = $props();

  const local = getProvider().api === "orchestrator";

  const recentAttempts = $derived(
    repositories
      .filter((repo) => repo.metrics.lastBackup)
      .toSorted(
        (a, b) =>
          +new Date(b.metrics.lastBackup!) - +new Date(a.metrics.lastBackup!),
      )
      .slice(0, 5),
  );

  const getActions = (repository: LocalRepositoryDto): ActionItem[] =>
    local
      ? []
      : [
          {
            title: $t`View history`,
            icon: mdiHistory,
            onAction: () =>
              void modalManager.open(MetricsHistoryModal, { repository }),
          },
        ];
</script>

<StackList>
  {#snippet title()}
    {$t`Recent backups`}
  {/snippet}

  {#if recentAttempts.length === 0}
    <StackListPlaceholder>
      {$t`Completed backups will appear here once your first backup runs.`}
    </StackListPlaceholder>
  {/if}

  {#each recentAttempts as repository (repository.id)}
    {@const outcome = getBackupOutcome(repository.metrics)}
    {@const failed = outcome === "failed"}

    <StackListItem
      title={repository.name}
      color={failed ? "danger" : outcome === "warn" ? "warning" : "success"}
      actions={getActions(repository)}
    >
      {#snippet icon()}
        <Icon icon={failed ? mdiCloudOffOutline : mdiCloudCheckOutline} />
      {/snippet}

      {failed
        ? $t`Attempted`
        : outcome === "warn"
          ? $t`Backed up with warnings`
          : $t`Backed up`}
      <RelativeTime time={repository.metrics.lastBackup!} />
    </StackListItem>
  {/each}
</StackList>
