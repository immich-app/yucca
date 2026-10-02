<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { useMetricsHistory } from "$lib/services/metricsHistory.service";
  import { formatDuration } from "$lib/utils/format";
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import type { RepositoryMetricsHistoryDto } from "@futo-org/backups-api-client";
  import {
    Alert,
    Button,
    getByteUnitString,
    Icon,
    LoadingSpinner,
    Modal,
    ModalBody,
    Text,
  } from "@immich/ui";
  import {
    mdiCloudAlertOutline,
    mdiCloudCancelOutline,
    mdiCloudCheckOutline,
    mdiCloudUploadOutline,
    mdiDatabaseOutline,
    mdiTimerOutline,
  } from "@mdi/js";
  import StackList from "../../ui/StackList.svelte";
  import StackListItem from "../../ui/StackListItem.svelte";
  import RelativeTime from "../../util/RelativeTime.svelte";
  import { tick } from "svelte";
  import { t } from "svelte-i18n-lingui";

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

  const describe = (entry: RepositoryMetricsHistoryDto) => {
    if (entry.started != null) {
      return {
        title: $t`Backup started`,
        icon: mdiCloudUploadOutline,
        color: "primary",
      } as const;
    }

    switch (entry.backupStatus) {
      case "complete": {
        return {
          title: $t`Backup finished`,
          icon: mdiCloudCheckOutline,
          color: "success",
        } as const;
      }
      case "warn": {
        return {
          title: $t`Backup finished with warnings`,
          icon: mdiCloudAlertOutline,
          color: "warning",
        } as const;
      }
      case "incomplete": {
        return {
          title: $t`Backup incomplete`,
          icon: mdiCloudAlertOutline,
          color: "warning",
        } as const;
      }
      case "cancelled": {
        return {
          title: $t`Backup cancelled`,
          icon: mdiCloudCancelOutline,
          color: "warning",
        } as const;
      }
    }

    if (entry.backup != null) {
      return {
        title: $t`Backup failed`,
        icon: mdiCloudAlertOutline,
        color: "danger",
      } as const;
    }

    if (entry.sizeBytes != null) {
      return {
        title: $t`Size updated`,
        icon: mdiDatabaseOutline,
        color: "primary",
      } as const;
    }

    return {
      title: $t`Event`,
      icon: mdiTimerOutline,
      color: "primary",
    } as const;
  };

  let sentinel = $state<HTMLDivElement | null>(null);
  let historyEnd = $state<HTMLDivElement>();

  const loadMore = async () => {
    await query.fetchNextPage();
    if (query.hasNextPage) return;
    await tick();
    historyEnd?.focus();
  };

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

<Modal
  title={$t({
    message: "Metrics history for {name}",
    values: { name: repository.name },
  })}
  size="medium"
  {onClose}
>
  <ModalBody>
    {#if query.isLoading}
      <LoadingSpinner />
    {:else if query.isError}
      <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
    {:else if entries.length === 0}
      <Text color="secondary" class="text-center py-6">
        {$t`No metrics history yet.`}
      </Text>
    {:else}
      <StackList>
        {#each entries as entry (entry.id)}
          {@const appearance = describe(entry)}
          <StackListItem title={appearance.title} color={appearance.color}>
            {#snippet icon()}
              <Icon icon={appearance.icon} />
            {/snippet}

            {#if entry.started}
              {$t({
                message: "Started {date}",
                values: { date: isoDate(entry.started) },
              })}
            {:else if entry.backupDuration != null}
              {$t({
                message: "Duration: {duration}",
                values: { duration: formatDuration(entry.backupDuration) },
              })}
            {:else if entry.sizeBytes != null}
              {$t({
                message: "Size {size}",
                values: { size: getByteUnitString(entry.sizeBytes) },
              })}
            {/if}

            {#snippet trailing()}
              <Text
                color="secondary"
                size="small"
                class="shrink-0"
                title={isoDate(entry.createdAt)}
              >
                <RelativeTime time={entry.createdAt} />
              </Text>
            {/snippet}
          </StackListItem>
        {/each}
      </StackList>

      {#if query.hasNextPage}
        <div bind:this={sentinel} class="flex justify-center py-4">
          <Button
            variant="ghost"
            size="small"
            loading={query.isFetchingNextPage}
            onclick={() => void loadMore()}
          >
            {$t`Load more`}
          </Button>
        </div>
      {:else if (query.data?.pages.length ?? 0) > 1}
        <div
          bind:this={historyEnd}
          tabindex="-1"
          class="flex justify-center py-4 outline-none"
        >
          <Text color="secondary" size="small">{$t`No more history`}</Text>
        </div>
      {/if}
    {/if}
  </ModalBody>
</Modal>
