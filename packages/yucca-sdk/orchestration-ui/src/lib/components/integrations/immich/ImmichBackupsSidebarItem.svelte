<script lang="ts">
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import {
    useImmichBackupStatus,
    useImmichBackupStatusEventHandler,
  } from "$lib/services/immich.integration.service";
  import { HStack, Icon, LoadingSpinner, Text } from "@immich/ui";
  import {
    mdiChevronRight,
    mdiCloudAlertOutline,
    mdiCloudCheckVariantOutline,
    mdiCloudOffOutline,
    mdiCloudUploadOutline,
  } from "@mdi/js";

  type Color = "primary" | "secondary" | "success" | "warning" | "danger";

  type Props = {
    href: string;
  };

  const { href }: Props = $props();

  const backup = useImmichBackupStatus();

  const { status } = $derived(backup);

  const configured = $derived(status.kind !== "unconfigured");

  const appearance = $derived.by(() => {
    switch (status.kind) {
      case "loading": {
        return { color: "secondary", icon: undefined } as const;
      }
      case "running": {
        return { color: "primary", icon: mdiCloudUploadOutline } as const;
      }
      case "offline":
      case "missing":
      case "failed": {
        return { color: "danger", icon: mdiCloudOffOutline } as const;
      }
      case "warn": {
        return { color: "warning", icon: mdiCloudCheckVariantOutline } as const;
      }
      case "paused": {
        return { color: "warning", icon: mdiCloudAlertOutline } as const;
      }
      case "unconfigured":
      case "never": {
        return { color: "warning", icon: mdiCloudOffOutline } as const;
      }
      case "complete": {
        return { color: "success", icon: mdiCloudCheckVariantOutline } as const;
      }
    }
  });

  const tints: Record<Color, string> = {
    primary: "bg-primary-50 text-primary",
    secondary: "bg-subtle text-muted",
    success: "bg-success-50 text-success-700",
    warning: "bg-warning-50 text-warning-800",
    danger: "bg-danger-50 text-danger-700",
  };
</script>

<OnEvents {...useImmichBackupStatusEventHandler()} />

<a
  {href}
  class="flex w-full cursor-pointer items-center gap-2 px-3 py-3 text-start text-sm {tints[
    appearance.color
  ]}"
>
  {#if appearance.icon}
    <Icon icon={appearance.icon} size="1.25em" class="shrink-0" />
  {:else}
    <LoadingSpinner size="tiny" class="shrink-0" />
  {/if}

  <Text size="tiny" class="flex-1 leading-tight">
    {#if status.kind === "loading"}
      Checking backup status
    {:else if status.kind === "offline"}
      Backup service is offline
    {:else if status.kind === "missing"}
      Backup missing on service
    {:else if status.kind === "running"}
      Backing up now
    {:else if status.kind === "failed"}
      Backup failed
    {:else if status.kind === "warn"}
      Backed up with warnings <RelativeTime time={status.lastBackup} />
    {:else if status.kind === "paused"}
      Backups paused
    {:else if status.kind === "unconfigured"}
      Not backed up
    {:else if status.kind === "complete"}
      Last backup <RelativeTime time={status.lastBackup} />
    {:else}
      Finish setting up backups
    {/if}
  </Text>

  <HStack gap={0}>
    {#if !configured}
      <Text size="tiny" color="primary" class="shrink-0">Set up</Text>
    {/if}

    <Icon
      icon={mdiChevronRight}
      size="1.25em"
      class={configured ? "shrink-0" : "shrink-0 text-primary"}
    />
  </HStack>
</a>
