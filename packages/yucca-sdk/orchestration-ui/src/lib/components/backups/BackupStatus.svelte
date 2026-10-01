<script module lang="ts">
  export type BackupStatusType = "backup" | "restore" | "forget";

  export type BackupStatusState =
    | "connecting"
    | "running"
    | "complete"
    | "warned"
    | "failed"
    | "cancelled";
</script>

<script lang="ts">
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import {
    Alert,
    Button,
    Heading,
    HStack,
    ProgressBar,
    Scrollable,
    Stack,
    Text,
  } from "@immich/ui";
  import type { Snippet } from "svelte";
  import { msg, plural, t } from "svelte-i18n-lingui";

  type Props = {
    title: string;
    type: BackupStatusType;
    state: BackupStatusState;
    progress?: number;
    start?: string;
    duration?: string;
    remaining?: string;
    errors?: string[];
    details?: Snippet;
    currentFiles?: string[];
    advanced?: Snippet;
    onRetry?: () => void;
  };

  const {
    title,
    type,
    state: backupState,
    progress = 0,
    start,
    duration,
    remaining,
    errors = [],
    details,
    currentFiles = [],
    advanced,
    onRetry,
  }: Props = $props();

  const phases: Record<BackupStatusType, [string, string, string]> = {
    backup: [msg`Preparing backup`, msg`Backing up`, msg`Finalizing backup`],
    restore: [msg`Preparing restore`, msg`Restoring`, msg`Finalizing restore`],
    forget: [msg`Preparing prune`, msg`Pruning`, msg`Finalizing prune`],
  };

  const succeeded: Record<BackupStatusType, string> = {
    backup: msg`Your library was backed up successfully`,
    restore: msg`Your library was restored successfully`,
    forget: msg`Old backups were pruned successfully`,
  };

  const warned: Record<BackupStatusType, string> = {
    backup: msg`Your library was backed up, with warnings`,
    restore: msg`Your library was restored, with warnings`,
    forget: msg`Old backups were pruned, with warnings`,
  };

  const failed: Record<BackupStatusType, string> = {
    backup: msg`Your library could not be backed up`,
    restore: msg`Your library could not be restored`,
    forget: msg`Old backups could not be pruned`,
  };

  const cancelled: Record<BackupStatusType, string> = {
    backup: msg`Your backup was cancelled`,
    restore: msg`Your restore was cancelled`,
    forget: msg`Pruning old backups was cancelled`,
  };

  const reassurance: Record<BackupStatusType, string> = {
    backup: msg`No changes were made to your existing backups.`,
    restore: msg`Your backups are untouched — nothing was lost.`,
    forget: msg`No backups were removed.`,
  };

  const running: Record<BackupStatusType, string> = {
    backup: msg`Immich is backing up your library. You can close this window and continue using Immich while the backup runs in the background.`,
    restore: msg`You can close this window and the restore will continue in the background.`,
    forget: msg`You can close this window and the prune will continue in the background.`,
  };

  const phase = $derived(
    progress <= 0
      ? $t(phases[type][0])
      : progress >= 0.95
        ? $t(phases[type][2])
        : $t(phases[type][1]),
  );

  const headline = $derived.by(() => {
    switch (backupState) {
      case "connecting": {
        return $t`Connecting…`;
      }
      case "failed": {
        return $t(failed[type]);
      }
      case "cancelled": {
        return $t(cancelled[type]);
      }
      case "complete": {
        return $t(succeeded[type]);
      }
      case "warned": {
        return $t(warned[type]);
      }
      default: {
        return $t({
          message: "{phase} · {percent}%",
          values: { phase, percent: Math.round(progress * 100) },
        });
      }
    }
  });

  const announcement = $derived(backupState === "running" ? phase : headline);

  const titleColor = $derived(
    backupState === "complete"
      ? "success"
      : backupState === "warned" || backupState === "cancelled"
        ? "warning"
        : backupState === "failed"
          ? "danger"
          : "primary",
  );

  const terminal = $derived(
    backupState === "complete" ||
      backupState === "warned" ||
      backupState === "failed" ||
      backupState === "cancelled",
  );
</script>

<Stack gap={4}>
  <Stack gap={2}>
    <Heading tag="h2" size="medium" color={titleColor} fontWeight="bold">{title}</Heading>

    <Stack gap={1}>
      <Heading tag="h3" size="small">{headline}</Heading>
      <p role="status" class="sr-only">{announcement}</p>

      {#if backupState === "running" && remaining}
        <Text>{remaining}</Text>
      {:else if backupState === "running" && start}
        <Text color="muted">{$t`Started`} <RelativeTime time={start} /></Text>
      {:else if backupState === "failed"}
        <Text color="muted">{$t(reassurance[type])}</Text>
      {:else if duration}
        <Text color="muted">
          {$t({ message: "Completed in {duration}", values: { duration } })}
        </Text>
      {/if}

      {#if backupState === "warned" && errors.length > 0}
        <Text color="warning">
          {$plural(errors.length, {
            one: "Completed with # warning.",
            other: "Completed with # warnings.",
          })}
        </Text>
      {/if}
    </Stack>
  </Stack>

  {#if !terminal}
    <ProgressBar
      {progress}
      aria-label={phase}
      valueLabel={`${Math.round(progress * 100)}%`}
      shape="round"
      size="small"
      class="bg-primary-100 border-none"
    />
  {/if}

  {#if terminal && (errors.length > 0 || (backupState === "failed" && onRetry))}
    <Stack gap={4}>
      {#if backupState === "failed" && onRetry}
        <HStack gap={4} class="items-center">
          <Button shape="round" onclick={onRetry}>{$t`Try again`}</Button>
        </HStack>
      {/if}

      {#if errors.length > 0}
        <Scrollable class="max-h-64">
          <Stack gap={2}>
            {#each errors as error, index (index)}
              <Alert color={backupState === "failed" ? "danger" : "warning"}>
                {error}
              </Alert>
            {/each}
          </Stack>
        </Scrollable>
      {/if}
    </Stack>
  {/if}

  {#if backupState === "running"}
    <Text color="muted">{$t(running[type])}</Text>
  {:else if (backupState === "complete" || backupState === "warned") && details}
    <Text color="muted">{@render details()}</Text>
  {/if}

  {#if backupState === "running" && currentFiles.length > 0}
    <Stack gap={1}>
      {#each currentFiles.slice(0, 3) as file, index (index)}
        <Text size="small" color="muted" class="truncate" title={file}>
          {file}
        </Text>
      {/each}
    </Stack>
  {/if}

  {@render advanced?.()}
</Stack>
