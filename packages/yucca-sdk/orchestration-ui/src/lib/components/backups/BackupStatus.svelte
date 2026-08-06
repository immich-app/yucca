<script module lang="ts">
  export type BackupStatusType = "backup" | "restore" | "forget";

  export type BackupStatusState =
    | "connecting"
    | "running"
    | "complete"
    | "failed";
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

  type Props = {
    title: string;
    type: BackupStatusType;
    state: BackupStatusState;
    progress?: number;
    start?: string;
    duration?: string;
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
    errors = [],
    details,
    currentFiles = [],
    advanced,
    onRetry,
  }: Props = $props();

  let showErrors = $state(false);

  const phases: Record<BackupStatusType, [string, string, string]> = {
    backup: ["Preparing backup", "Backing up", "Finalizing backup"],
    restore: ["Preparing restore", "Restoring", "Finalizing restore"],
    forget: ["Preparing prune", "Pruning", "Finalizing prune"],
  };

  const succeeded: Record<BackupStatusType, string> = {
    backup: "Your library was backed up successfully",
    restore: "Your library was restored successfully",
    forget: "Old backups were pruned successfully",
  };

  const failed: Record<BackupStatusType, string> = {
    backup: "Your library could not be backed up",
    restore: "Your library could not be restored",
    forget: "Old backups could not be pruned",
  };

  const reassurance: Record<BackupStatusType, string> = {
    backup: "No changes were made to your existing backups.",
    restore: "Your backups are untouched — nothing was lost.",
    forget: "No backups were removed.",
  };

  const running: Record<BackupStatusType, string> = {
    backup:
      "You can close this window and the backup will continue in the background.",
    restore:
      "You can close this window and the restore will continue in the background.",
    forget:
      "You can close this window and the prune will continue in the background.",
  };

  const phase = $derived(
    progress <= 0
      ? phases[type][0]
      : progress >= 0.95
        ? phases[type][2]
        : phases[type][1],
  );

  const headline = $derived.by(() => {
    switch (backupState) {
      case "connecting": {
        return "Connecting…";
      }
      case "failed": {
        return failed[type];
      }
      case "complete": {
        return succeeded[type];
      }
      default: {
        return `${phase} · ${Math.round(progress * 100)}%`;
      }
    }
  });

  const titleColor = $derived(
    backupState === "complete" ? "success" : backupState === "failed" ? "danger" : "primary",
  );

  const terminal = $derived(backupState === "complete" || backupState === "failed");
</script>

<Stack gap={4}>
  <Stack gap={2}>
    <Heading size="medium" color={titleColor} fontWeight="bold">{title}</Heading>

    <Stack gap={1}>
      <Heading size="small">{headline}</Heading>

      {#if backupState === "running" && start}
        <Text color="muted">Started <RelativeTime time={start} /></Text>
      {:else if backupState === "failed"}
        <Text color="muted">{reassurance[type]}</Text>
      {:else if duration}
        <Text color="muted">Completed in {duration}</Text>
      {/if}

      {#if backupState === "complete" && errors.length > 0}
        <Text color="warning">
          Completed with {errors.length}
          {errors.length === 1 ? "warning" : "warnings"}.
        </Text>
      {/if}
    </Stack>
  </Stack>

  {#if !terminal}
    <ProgressBar
      {progress}
      shape="round"
      size="tiny"
      class="bg-primary-100 border-none"
    />
  {/if}

  {#if terminal && (errors.length > 0 || (backupState === "failed" && onRetry))}
    <HStack gap={4} class="items-center">
      {#if backupState === "failed" && onRetry}
        <Button shape="round" onclick={onRetry}>Try again</Button>
      {/if}

      {#if errors.length > 0}
        <Button
          variant="ghost"
          shape="round"
          onclick={() => (showErrors = !showErrors)}
        >
          {showErrors ? "Hide details" : "View details"}
        </Button>
      {/if}
    </HStack>

    {#if showErrors}
      <Scrollable class="max-h-32">
        <Stack gap={1}>
          {#each errors as error, index (index)}
            <Alert color={backupState === "failed" ? "danger" : "warning"}>
              {error}
            </Alert>
          {/each}
        </Stack>
      </Scrollable>
    {/if}
  {/if}

  {#if backupState === "running"}
    <Text color="muted">{running[type]}</Text>
  {:else if backupState === "complete" && details}
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
