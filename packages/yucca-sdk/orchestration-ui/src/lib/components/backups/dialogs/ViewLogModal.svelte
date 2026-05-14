<script lang="ts">
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import { createLogObserver } from "$lib/services/log.service.svelte";
  import { useRun, useRunEventHandler } from "$lib/services/runHistory.service";
  import { options } from "$lib/options";
  import { formatDuration } from "$lib/utils/format";
  import {
    Alert,
    FormatBytes,
    Heading,
    Modal,
    ModalBody,
    ProgressBar,
    Scrollable,
    Stack,
    Text,
  } from "@immich/ui";
  import { DateTime } from "luxon";
  import { onDestroy } from "svelte";

  type Props = {
    logId: string;
    onClose: () => void;
  };

  let { logId, onClose }: Props = $props();

  const advanced = options.advanced;
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

  const isRestore = $derived(run?.type === "restore");
  const running = $derived(run?.status === "incomplete");
  const duration = $derived(
    run
      ? formatDuration(
          (run.end ? DateTime.fromISO(run.end) : now).toMillis() -
            DateTime.fromISO(run.start).toMillis(),
        )
      : "",
  );
</script>

<OnEvents {onRunUpdate} />

<Modal title={isRestore ? "Restore Log" : "Backup Log"} size="giant" {onClose}>
  <ModalBody>
    <Stack gap={5}>
      <Stack gap={1}>
        {#if !run}
          <Heading size="medium">Connecting…</Heading>
        {:else if run.status === "incomplete"}
          <Heading size="medium">
            {isRestore ? "Restoring" : "Backing up"} &middot; {Math.round(
              log.status.progress * 100,
            )}%
          </Heading>
        {:else if run.status === "failed"}
          <Heading size="medium" color="danger">
            {isRestore ? "Restore" : "Backup"} failed after {duration}
          </Heading>
        {:else if log.errors.length > 0}
          <Heading size="medium" color="warning">
            {isRestore ? "Restored" : "Backed up"} in {duration} &middot; {log.errors
              .length} error{log.errors.length === 1 ? "" : "s"}
          </Heading>
        {:else}
          <Heading size="medium" color="success">
            {isRestore ? "Restored" : "Backed up"} in {duration}
          </Heading>
        {/if}

        {#if run}
          <Text color="secondary">
            Started <RelativeTime time={run.start} />
          </Text>
        {/if}
      </Stack>

      {#if running}
        <ProgressBar progress={log.status.progress} size="large">
          {#if log.status.text}
            <Text
              size="small"
              class={log.status.progress > 0.5 ? "text-light" : "text-dark"}
            >
              {log.status.text}
            </Text>
          {/if}
        </ProgressBar>
      {/if}

      {#if log.errors.length > 0}
        <Stack gap={2}>
          <Alert color="danger">{log.errors[0]}</Alert>
          {#if log.errors.length > 1}
            <Scrollable class="max-h-32">
              <Stack gap={1}>
                {#each log.errors.slice(1) as error}
                  <Alert color="danger">{error}</Alert>
                {/each}
              </Stack>
            </Scrollable>
          {/if}
        </Stack>
      {/if}

      {#if log.summary}
        <Stack gap={1}>
          {#if isRestore}
            <Text>
              {(log.summary.files_restored ?? 0).toLocaleString()} restored
              {#if log.summary.files_skipped}
                &middot; {log.summary.files_skipped.toLocaleString()} skipped
              {/if}
              {#if log.summary.files_deleted}
                &middot; {log.summary.files_deleted.toLocaleString()} deleted
              {/if}
            </Text>
            {#if log.summary.bytes_restored !== undefined}
              <Text color="secondary">
                Restored <FormatBytes bytes={log.summary.bytes_restored} />
                {#if log.summary.total_bytes !== undefined}
                  of
                  <FormatBytes
                    bytes={Math.max(
                      log.summary.bytes_restored,
                      log.summary.total_bytes,
                    )}
                  />
                {/if}
              </Text>
            {/if}
          {:else}
            <Text>
              {(log.summary.files_new ?? 0).toLocaleString()} new &middot;
              {(log.summary.files_changed ?? 0).toLocaleString()} changed &middot;
              {(log.summary.files_unmodified ?? 0).toLocaleString()} unchanged
            </Text>
            {#if log.summary.data_added !== undefined}
              <Text color="secondary">
                Added <FormatBytes bytes={log.summary.data_added} />
                {#if log.summary.total_bytes_processed !== undefined}
                  of
                  <FormatBytes
                    bytes={Math.max(
                      log.summary.data_added,
                      log.summary.total_bytes_processed,
                    )}
                  /> processed
                {/if}
              </Text>
            {/if}
          {/if}
        </Stack>
      {/if}

      {#if running}
        <Stack gap={1} class="h-20 overflow-hidden">
          {#each log.status.currentFiles.slice(0, 3) as file}
            <Text size="small" color="secondary" class="truncate" title={file}>
              {file}
            </Text>
          {/each}
        </Stack>
      {/if}

      {#if $advanced}
        <Stack gap={1}>
          <Heading size="small">Event Log</Heading>
          <Scrollable class="h-80 overflow-x-hidden">
            <Stack gap={1}>
              {#each log.events as event}
                <Text size="tiny" class="font-mono select-all">
                  {JSON.stringify(event)}
                </Text>
              {/each}
            </Stack>
          </Scrollable>
        </Stack>
      {/if}
    </Stack>
  </ModalBody>
</Modal>
