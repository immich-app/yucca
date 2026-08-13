<script lang="ts">
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import { HStack, Icon, Text } from "@immich/ui";
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
    failed?: boolean;
    paused?: boolean;
    running?: boolean;
    href?: string;
    onclick?: () => void;
    class?: string;
  };

  const {
    configured,
    lastBackup,
    failed = false,
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

    if (failed) {
      return { color: "danger", icon: mdiCloudOffOutline } as const;
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
  <Icon
    color={status.color}
    icon={status.icon}
    size="1.25em"
    class="shrink-0"
  />

  <Text size="tiny" color={status.color} class="flex-1 truncate">
    {#if running}
      Backing up now
    {:else if failed}
      Backup failed
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

  <HStack gap={0}>
    {#if !configured}
      <Text size="tiny" color="primary" class="shrink-0">Set up</Text>
    {/if}

    <Icon
      color={configured ? status.color : "primary5"}
      icon={mdiChevronRight}
      size="1.25em"
      class="shrink-0"
    />
  </HStack>
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
