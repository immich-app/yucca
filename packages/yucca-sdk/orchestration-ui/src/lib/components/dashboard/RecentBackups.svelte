<script lang="ts">
  import {
    Button,
    Card,
    CardBody,
    HStack,
    Icon,
    Stack,
    Text,
  } from "@immich/ui";
  import {
    mdiAlertCircleOutline,
    mdiCheckCircleOutline,
    mdiChevronRight,
  } from "@mdi/js";
  import { Duration } from "luxon";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import type { RepositoryWithMetricsDto } from "yucca-api-client";

  type Props = {
    repositories: RepositoryWithMetricsDto[];
    onNavigate?: () => void;
  };

  const { repositories, onNavigate }: Props = $props();

  const recentBackups = $derived(
    repositories
      .filter((repo) => repo.metrics.lastBackup)
      .toSorted(
        (a, b) =>
          +new Date(b.metrics.lastBackup!) - +new Date(a.metrics.lastBackup!),
      )
      .slice(0, 5),
  );

  const isSuccess = (repo: RepositoryWithMetricsDto) =>
    repo.metrics.lastBackup === repo.metrics.lastSuccessfulBackup;

  const formatDuration = (ms: number) =>
    Duration.fromMillis(ms).rescale().toHuman({ unitDisplay: "narrow" });
</script>

<Card>
  <CardBody>
    <Stack>
      <HStack class="items-center justify-between">
        <Text size="large">Recent Backups</Text>
        {#if onNavigate && recentBackups.length > 0}
          <Button size="small" variant="outline" onclick={onNavigate}>
            View all
            <Icon icon={mdiChevronRight} size="16" />
          </Button>
        {/if}
      </HStack>

      {#if recentBackups.length === 0}
        <Text color="secondary">
          Completed backups will appear here once your first backup runs.
        </Text>
      {:else}
        <div>
          {#each recentBackups as repo, i (repo.id)}
            {#if i > 0}
              <hr
                style="border: none; border-top: 1px solid var(--immich-ui-default-border);"
              />
            {/if}
            <HStack class="items-center justify-between py-2">
              <HStack class="items-center gap-2">
                {#if isSuccess(repo)}
                  <Icon
                    icon={mdiCheckCircleOutline}
                    size="16"
                    class="text-green-500"
                  />
                {:else}
                  <Icon
                    icon={mdiAlertCircleOutline}
                    size="16"
                    class="text-danger-500"
                  />
                {/if}
                <Text class="text-sm">{repo.name}</Text>
              </HStack>
              <HStack class="items-center gap-2">
                {#if repo.metrics.lastBackupDuration != null}
                  <Text color="secondary" class="text-xs">
                    {formatDuration(repo.metrics.lastBackupDuration)}
                  </Text>
                {/if}
                <Text color="secondary" class="text-xs">
                  <RelativeTime time={repo.metrics.lastBackup!} />
                </Text>
              </HStack>
            </HStack>
          {/each}
        </div>
      {/if}
    </Stack>
  </CardBody>
</Card>
