<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { useMetricsHistory } from "$lib/services/metricsHistory.service";
  import { formatDuration } from "$lib/utils/format";
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import {
    Alert,
    Badge,
    getByteUnitString,
    HStack,
    Icon,
    LoadingSpinner,
    Modal,
    ModalBody,
    Stack,
    Text,
  } from "@immich/ui";
  import {
    mdiAlertCircleOutline,
    mdiCheckCircleOutline,
    mdiDatabaseOutline,
    mdiPlayCircleOutline,
    mdiTimerOutline,
  } from "@mdi/js";
  import RelativeTime from "../../util/RelativeTime.svelte";

  type Props = {
    repository: LocalRepositoryDto;
    onClose: () => void;
  };

  const { repository, onClose }: Props = $props();

  // svelte-ignore state_referenced_locally
  const query = useMetricsHistory(repository.id);

  const entries = $derived(
    query.data?.pages.flatMap((page) => page.items) ?? [],
  );

  const isoDate = (value: string) => new Date(value).toLocaleString();

  let sentinel = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry.isIntersecting &&
          query.hasNextPage &&
          !query.isFetchingNextPage
        ) {
          void query.fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });
</script>

<Modal title={`Metrics history for ${repository.name}`} size="large" {onClose}>
  <ModalBody>
    {#if query.isLoading}
      <LoadingSpinner />
    {:else if query.isError}
      <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
    {:else if entries.length === 0}
      <Text color="secondary" class="text-center py-6">
        No metrics history yet.
      </Text>
    {:else}
      <Stack gap={0} class="divide-y rounded-2xl border overflow-hidden">
        {#each entries as entry (entry.id)}
          {@const isStart = entry.started != null}
          {@const isEnd = entry.backup != null}
          {@const isSize = entry.sizeBytes != null && !isStart && !isEnd}
          {@const succeeded =
            isEnd &&
            entry.successfulBackup != null &&
            entry.successfulBackup === entry.backup}
          <Stack gap={1} class="px-4 py-3">
            <HStack class="justify-between gap-4">
              <HStack class="gap-2">
                {#if isStart}
                  <Icon
                    icon={mdiPlayCircleOutline}
                    size="18"
                    class="text-info-500"
                  />
                  <Text>Backup started</Text>
                {:else if isEnd && succeeded}
                  <Icon
                    icon={mdiCheckCircleOutline}
                    size="18"
                    class="text-success-500"
                  />
                  <Text>Backup finished</Text>
                  <Badge size="tiny" color="success">Success</Badge>
                {:else if isEnd}
                  <Icon
                    icon={mdiAlertCircleOutline}
                    size="18"
                    class="text-danger-500"
                  />
                  <Text>Backup finished</Text>
                  <Badge size="tiny" color="danger">Failed</Badge>
                {:else if isSize}
                  <Icon
                    icon={mdiDatabaseOutline}
                    size="18"
                    class="text-info-500"
                  />
                  <Text>Size updated</Text>
                {:else}
                  <Icon icon={mdiTimerOutline} size="18" color="secondary" />
                  <Text>Event</Text>
                {/if}
              </HStack>
              <Text
                color="secondary"
                size="small"
                title={isoDate(entry.createdAt)}
              >
                <RelativeTime time={entry.createdAt} />
              </Text>
            </HStack>

            <HStack class="gap-2 flex-wrap pl-7">
              {#if entry.backupDuration != null}
                <Badge size="tiny" color="secondary">
                  Duration {formatDuration(entry.backupDuration)}
                </Badge>
              {/if}
              {#if entry.sizeBytes != null}
                <Badge size="tiny" color="secondary">
                  Size {getByteUnitString(entry.sizeBytes)}
                </Badge>
              {/if}
              {#if entry.started}
                <Badge size="tiny" color="secondary">
                  Started {isoDate(entry.started)}
                </Badge>
              {/if}
              {#if entry.backup}
                <Badge size="tiny" color="secondary">
                  Ended {isoDate(entry.backup)}
                </Badge>
              {/if}
            </HStack>
          </Stack>
        {/each}
      </Stack>

      {#if query.hasNextPage}
        <div bind:this={sentinel} class="flex justify-center py-4">
          {#if query.isFetchingNextPage}
            <LoadingSpinner />
          {/if}
        </div>
      {/if}
    {/if}
  </ModalBody>
</Modal>
