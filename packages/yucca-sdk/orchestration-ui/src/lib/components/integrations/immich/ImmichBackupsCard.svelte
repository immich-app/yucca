<script lang="ts">
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import type { BackupOutcome } from "$lib/utils/backup-status";
  import { Icon, Text } from "@immich/ui";
  import {
    mdiChevronRight,
    mdiCloudAlertOutline,
    mdiCloudCheckVariantOutline,
    mdiCloudOffOutline,
    mdiCloudUploadOutline,
  } from "@mdi/js";

  type Color = "primary" | "success" | "warning" | "danger";

  type Props = {
    configured: boolean;
    lastBackup?: string;
    outcome?: BackupOutcome;
    paused?: boolean;
    running?: boolean;
    href?: string;
    onclick?: () => void;
    class?: string;
  };

  const {
    configured,
    lastBackup,
    outcome = "never",
    paused = false,
    running = false,
    href,
    onclick,
    class: className,
  }: Props = $props();

  const status = $derived.by(() => {
    if (running) {
      return { color: "primary", icon: mdiCloudUploadOutline } as const;
    }

    if (outcome === "failed") {
      return { color: "danger", icon: mdiCloudOffOutline } as const;
    }

    if (outcome === "warn") {
      return { color: "warning", icon: mdiCloudCheckVariantOutline } as const;
    }

    if (paused) {
      return { color: "warning", icon: mdiCloudAlertOutline } as const;
    }

    if (!configured || !lastBackup) {
      return { color: "warning", icon: mdiCloudOffOutline } as const;
    }

    return { color: "success", icon: mdiCloudCheckVariantOutline } as const;
  });

  const tints: Record<Color, string> = {
    primary: "bg-primary-50 text-primary",
    success: "bg-success-50 text-success-700",
    warning: "bg-warning-50 text-warning-800",
    danger: "bg-danger-50 text-danger-700",
  };

  const shell = $derived(
    `flex w-full cursor-pointer items-center gap-2 px-3 py-3 text-start text-sm ${tints[status.color]} ${className ?? ""}`,
  );
</script>

{#snippet body()}
  <Icon icon={status.icon} size="1.25em" class="shrink-0" />

  <Text
    size="small"
    color={status.color}
    fontWeight="medium"
    class="flex-1 truncate"
  >
    {#if running}
      Backing up now
    {:else if outcome === "failed"}
      Backup failed
    {:else if outcome === "warn" && lastBackup}
      Backed up with warnings <RelativeTime time={lastBackup} />
    {:else if paused}
      Backups paused
    {:else if !configured}
      Not backed up
    {:else if lastBackup}
      Last backup <RelativeTime time={lastBackup} />
    {:else}
      Finish setting up backups
    {/if}
  </Text>

  {#if !configured}
    <Text size="small" color="primary" fontWeight="medium" class="shrink-0">
      Set up
    </Text>
  {/if}

  <Icon icon={mdiChevronRight} size="1.25em" class="shrink-0" />
{/snippet}

{#if href}
  <a {href} {onclick} class={shell}>
    {@render body()}
  </a>
{:else}
  <button type="button" {onclick} class={shell}>
    {@render body()}
  </button>
{/if}
