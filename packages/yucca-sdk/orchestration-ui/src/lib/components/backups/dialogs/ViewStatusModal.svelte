<script lang="ts">
  import BackupStatus, {
    type BackupStatusState,
    type BackupStatusType,
  } from "$lib/components/backups/BackupStatus.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import { options } from "$lib/options";
  import { createLogObserver } from "$lib/services/log.service.svelte";
  import { useRun, useRunEventHandler } from "$lib/services/runHistory.service";
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
    backup: { running: "Backing up your library", done: "Backup" },
    restore: { running: "Restoring your library", done: "Restore" },
    forget: { running: "Pruning old backups", done: "Prune" },
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
        return `${titles[type].done} complete`;
      }
      case "warned": {
        return `${titles[type].done} completed with warnings`;
      }
      case "failed": {
        return `${titles[type].done} failed`;
      }
      default: {
        return titles[type].running;
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
      errors={log.errors}
      currentFiles={log.status.currentFiles}
      onRetry={retry}
    >
      {#snippet details()}
        {#if log.summary && type === "backup"}
          {(log.summary.total_files_processed ?? 0).toLocaleString()} items backed
          up &middot;
          {(log.summary.files_new ?? 0).toLocaleString()} new items
          {#if log.summary.total_bytes_processed !== undefined}
            &middot;
            <FormatBytes bytes={log.summary.total_bytes_processed} /> processed
          {/if}
        {:else if log.summary && type === "restore"}
          {(log.summary.files_restored ?? 0).toLocaleString()} items restored{#if log.summary.files_skipped}
            &middot; {log.summary.files_skipped.toLocaleString()} skipped
          {/if}
          {#if log.summary.bytes_restored !== undefined}
            &middot; <FormatBytes bytes={log.summary.bytes_restored} /> restored
          {/if}
        {:else if type === "forget"}
          {log.pruned.removed.toLocaleString()}
          {log.pruned.removed === 1 ? "backup" : "backups"} removed &middot;
          {log.pruned.kept.toLocaleString()} kept
        {/if}
      {/snippet}

      {#snippet advanced()}
        {#if showAdvanced}
          <Stack gap={1}>
            <Heading size="small">Event Log</Heading>
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
