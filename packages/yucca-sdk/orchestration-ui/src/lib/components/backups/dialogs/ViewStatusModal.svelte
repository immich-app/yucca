<script lang="ts">
  import BackupStatus, {
    type BackupStatusState,
    type BackupStatusType,
  } from "$lib/components/backups/BackupStatus.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import { options } from "$lib/options";
  import { createLogObserver } from "$lib/services/log.service.svelte";
  import { useRun, useRunEventHandler } from "$lib/services/runHistory.service";
  import { handleCancelTask } from "$lib/services/task.service";
  import { formatDuration } from "$lib/utils/format";
  import {
    CloseButton,
    FormatBytes,
    Heading,
    HStack,
    Modal,
    ModalBody,
    ModalHeader,
    Scrollable,
    Stack,
    Text,
  } from "@immich/ui";
  import { DateTime } from "luxon";
  import { onDestroy } from "svelte";
  import { msg, plural, t } from "svelte-i18n-lingui";

  type Props = {
    logId: string;
    onClose: () => void;
    onRetry?: () => void;
  };

  const { logId, onClose, onRetry }: Props = $props();

  const advanced = options.advanced;
  const showAdvanced = $derived($advanced);
  // svelte-ignore state_referenced_locally
  const log = createLogObserver(logId);
  // svelte-ignore state_referenced_locally
  const runQuery = useRun(logId);
  const run = $derived(runQuery.data);
  const { onRunUpdate } = useRunEventHandler();

  let now = $state(DateTime.now());
  const tick = setInterval(() => (now = DateTime.now()), 1000);

  onDestroy(() => {
    clearInterval(tick);
    log.destroy();
  });

  const type: BackupStatusType = $derived(
    run?.type === "restore" || run?.type === "forget" ? run.type : "backup",
  );

  const backupState: BackupStatusState = $derived.by(() => {
    if (!run) {
      return "connecting";
    }

    switch (run.status) {
      case "incomplete": {
        return "running";
      }
      case "failed": {
        return "failed";
      }
      case "cancelled": {
        return "cancelled";
      }
      case "warn": {
        return "warned";
      }
      default: {
        return "complete";
      }
    }
  });

  const duration = $derived(
    run
      ? formatDuration(
          (run.end ? DateTime.fromISO(run.end) : now).toMillis() -
            DateTime.fromISO(run.start).toMillis(),
          "long",
        )
      : "",
  );

  const titles: Record<BackupStatusType, Record<"running" | "done", string>> = {
    backup: { running: msg`Backing up your library`, done: msg`Backup` },
    restore: { running: msg`Restoring your library`, done: msg`Restore` },
    forget: { running: msg`Pruning old backups`, done: msg`Prune` },
  };

  const retry = $derived(
    onRetry
      ? () => {
          onClose();
          onRetry();
        }
      : undefined,
  );

  const title = $derived.by(() => {
    switch (backupState) {
      case "complete": {
        return $t({
          message: "{name} complete",
          values: { name: $t(titles[type].done) },
        });
      }
      case "warned": {
        return $t({
          message: "{name} completed with warnings",
          values: { name: $t(titles[type].done) },
        });
      }
      case "failed": {
        return $t({
          message: "{name} failed",
          values: { name: $t(titles[type].done) },
        });
      }
      case "cancelled": {
        return $t({
          message: "{name} cancelled",
          values: { name: $t(titles[type].done) },
        });
      }
      default: {
        return $t(titles[type].running);
      }
    }
  });
</script>

<OnEvents {onRunUpdate} />

<Modal
  size="medium"
  {onClose}
  // this is a bit of a hack to remove the frames from base modal...
  // this one might be removed ; twin code is in UpsellModal
  class="[&>div>div:first-child]:border-b-0 [&>div>div:first-child]:px-8 [&>div>div:first-child]:pb-0"
>
  <ModalHeader>
    <HStack fullWidth class="justify-end">
      <CloseButton onclick={onClose} />
    </HStack>
  </ModalHeader>

  <ModalBody class="px-8 pt-2 pb-8">
    <BackupStatus
      {title}
      {type}
      state={backupState}
      progress={log.status.progress}
      start={run?.start}
      {duration}
      remaining={log.status.text}
      errors={log.errors}
      currentFiles={log.status.currentFiles}
      onRetry={retry}
      onCancel={run ? () => void handleCancelTask(run.repositoryId) : undefined}
    >
      {#snippet details()}
        {#if log.summary && type === "backup"}
          {$t({
            message: "{count} items backed up",
            values: {
              count: (log.summary.total_files_processed ?? 0).toLocaleString(),
            },
          })} &middot;
          {$t({
            message: "{count} new items",
            values: { count: (log.summary.files_new ?? 0).toLocaleString() },
          })}
          {#if log.summary.total_bytes_processed !== undefined}
            &middot;
            <FormatBytes bytes={log.summary.total_bytes_processed} /> {$t`processed`}
          {/if}
        {:else if log.summary && type === "restore"}
          {$t({
            message: "{count} items restored",
            values: { count: (log.summary.files_restored ?? 0).toLocaleString() },
          })}{#if log.summary.files_skipped}
            &middot; {$t({
              message: "{count} skipped",
              values: { count: log.summary.files_skipped.toLocaleString() },
            })}
          {/if}
          {#if log.summary.bytes_restored !== undefined}
            &middot; <FormatBytes bytes={log.summary.bytes_restored} /> {$t`restored`}
          {/if}
        {:else if type === "forget"}
          {$plural(log.pruned.removed, {
            one: "# backup removed",
            other: "# backups removed",
          })} &middot;
          {$t({
            message: "{count} kept",
            values: { count: log.pruned.kept.toLocaleString() },
          })}
        {/if}
      {/snippet}

      {#snippet advanced()}
        {#if showAdvanced}
          <Stack gap={1}>
            <Heading tag="h3" size="small">{$t`Event Log`}</Heading>
            <Scrollable class="h-80 overflow-x-hidden">
              <Stack gap={1}>
                {#each log.events as event, index (index)}
                  <Text size="tiny" class="font-mono select-all">
                    {JSON.stringify(event)}
                  </Text>
                {/each}
              </Stack>
            </Scrollable>
          </Stack>
        {/if}
      {/snippet}
    </BackupStatus>
  </ModalBody>
</Modal>
