<script lang="ts">
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import { FormatBytes, Icon, Stack, Text } from "@immich/ui";
  import { mdiChevronRight, mdiCloudAlertOutline, mdiCloudUpload } from "@mdi/js";

  type Props = {
    configured: boolean;
    lastBackup?: string;
    failed?: boolean;
    sizeBytes?: number;
    href?: string;
    onclick?: () => void;
    class?: string;
  };

  const {
    configured,
    lastBackup,
    failed = false,
    sizeBytes,
    href,
    onclick,
    class: className,
  }: Props = $props();

  const shell =
    "border-primary/25 hover:bg-primary/5 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors";
</script>

{#snippet body()}
  <Icon
    icon={failed ? mdiCloudAlertOutline : mdiCloudUpload}
    size="2em"
    class="{failed ? 'text-danger' : 'text-primary'} shrink-0"
  />

  {#if !configured}
    <Text color="primary" fontWeight="medium" class="flex-1 whitespace-nowrap">
      Set up Backups
    </Text>
  {:else}
    <Stack gap={0} class="min-w-0 flex-1">
      <Text fontWeight="medium" color={failed ? "danger" : "primary"}>
        {failed ? "Backup failed" : "Last Backup"}
      </Text>

      <Text size="small" color="muted" class="truncate">
        {#if lastBackup}
          <RelativeTime time={lastBackup} />
          {#if sizeBytes !== undefined}
            &nbsp;&middot; <FormatBytes bytes={sizeBytes} />
          {/if}
        {:else}
          No backups yet
        {/if}
      </Text>
    </Stack>

    <Icon icon={mdiChevronRight} size="1.4em" class="text-muted shrink-0" />
  {/if}
{/snippet}

<div class={className ?? ""}>
  {#if href}
    <a {href} {onclick} class={shell}>
      {@render body()}
    </a>
  {:else}
    <button type="button" {onclick} class={shell}>
      {@render body()}
    </button>
  {/if}
</div>
