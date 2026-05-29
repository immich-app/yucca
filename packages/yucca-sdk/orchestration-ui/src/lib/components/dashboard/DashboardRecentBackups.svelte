<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import {
    Card,
    CardBody,
    CardHeader,
    CardTitle,
    ContextMenuButton,
    HStack,
    Icon,
    modalManager,
    Text,
    type ActionItem,
  } from "@immich/ui";
  import {
    mdiAlertCircleOutline,
    mdiCheckCircleOutline,
    mdiDotsVertical,
    mdiHistory,
  } from "@mdi/js";
  import RelativeTime from "../util/RelativeTime.svelte";
  import MetricsHistoryModal from "../backups/metrics-history/MetricsHistoryModal.svelte";

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

  const getActions = (repository: LocalRepositoryDto): ActionItem[] => [
    {
      title: "View history",
      icon: mdiHistory,
      onAction: () =>
        void modalManager.open(MetricsHistoryModal, { repository }),
    },
  ];
</script>

<Card>
  <CardHeader>
    <CardTitle>Recent Backups</CardTitle>
  </CardHeader>
  <CardBody>
    {#if recentAttempts.length === 0}
      <Text color="secondary">
        Completed backups will appear here once your first backup runs.
      </Text>
    {:else}
      <div>
        {#each recentAttempts as repo, index (repo.id)}
          {#if index > 0}
            <hr
              style="border: none; border-top: 1px solid var(--immich-ui-default-border);"
            />
          {/if}
          <HStack class="justify-between py-2">
            <HStack class="gap-2">
              {#if repo.metrics.lastBackup === repo.metrics.lastSuccessfulBackup}
                <Icon
                  icon={mdiCheckCircleOutline}
                  size="16"
                  class="text-success-500"
                />
              {:else}
                <Icon
                  icon={mdiAlertCircleOutline}
                  size="16"
                  class="text-danger-500"
                />
              {/if}
              <Text>{repo.name}</Text>
            </HStack>
            <HStack class="gap-1">
              <Text color="secondary" size="small">
                <RelativeTime time={repo.metrics.lastBackup!} />
              </Text>
              {#if !local}
                <ContextMenuButton
                  icon={mdiDotsVertical}
                  aria-label="Options"
                  items={getActions(repo)}
                  variant="ghost"
                  color="secondary"
                />
              {/if}
            </HStack>
          </HStack>
        {/each}
      </div>
    {/if}
  </CardBody>
</Card>
