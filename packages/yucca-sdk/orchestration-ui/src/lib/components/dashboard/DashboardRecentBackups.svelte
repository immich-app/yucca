<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { Icon, modalManager, type ActionItem } from "@immich/ui";
  import {
    mdiCloudCheckOutline,
    mdiCloudOffOutline,
    mdiHistory,
  } from "@mdi/js";
  import MetricsHistoryModal from "../backups/metrics-history/MetricsHistoryModal.svelte";
  import StackList from "../ui/StackList.svelte";
  import StackListPlaceholder from "../ui/StackListPlaceholder.svelte";
  import StackListItem from "../ui/StackListItem.svelte";
  import RelativeTime from "../util/RelativeTime.svelte";

  type Props = {
    repositories: LocalRepositoryDto[];
    local?: boolean;
  };

  const { repositories, local }: Props = $props();

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
            title: "View history",
            icon: mdiHistory,
            onAction: () =>
              void modalManager.open(MetricsHistoryModal, { repository }),
          },
        ];
</script>

<StackList>
  {#snippet title()}
    Recent backups
  {/snippet}

  {#if recentAttempts.length === 0}
    <StackListPlaceholder>
      Completed backups will appear here once your first backup runs.
    </StackListPlaceholder>
  {/if}

  {#each recentAttempts as repository (repository.id)}
    {@const successful =
      repository.metrics.lastBackup === repository.metrics.lastSuccessfulBackup}

    <StackListItem
      title={repository.name}
      color={successful ? "success" : "danger"}
      actions={getActions(repository)}
    >
      {#snippet icon()}
        <Icon icon={successful ? mdiCloudCheckOutline : mdiCloudOffOutline} />
      {/snippet}

      {successful ? "Backed up" : "Attempted"}
      <RelativeTime time={repository.metrics.lastBackup!} />
    </StackListItem>
  {/each}
</StackList>
