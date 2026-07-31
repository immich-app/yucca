<script lang="ts">
  import RelativeTime from "$lib/components/util/RelativeTime.svelte";
  import { FormatBytes, Icon, Stack, Text } from "@immich/ui";
  import {
    mdiChevronRight,
    mdiCloudAlertOutline,
    mdiCloudUpload,
    mdiInformationOutline,
  } from "@mdi/js";
  import ImmichBackupsUpsellPopover from "./ImmichBackupsUpsellPopover.svelte";

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

  let showUpsell = $state(false);

  const toggleUpsell = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    showUpsell = !showUpsell;
  };

  const setUp = () => {
    showUpsell = false;
    onclick?.();
  };

  const shell = $derived(
    `border-primary/25 hover:bg-primary/5 flex w-full items-center gap-3 rounded-xl border ps-3 py-2.5 text-start transition-colors ${configured ? "pe-3" : "pe-10"}`,
  );
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

<div class="relative {className ?? ''}">
  {#if showUpsell}
    <ImmichBackupsUpsellPopover
      onSetUp={setUp}
      onClose={() => (showUpsell = false)}
    />
  {/if}

  {#if href}
    <a {href} {onclick} class={shell}>
      {@render body()}
    </a>
  {:else}
    <button type="button" {onclick} class={shell}>
      {@render body()}
    </button>
  {/if}

  {#if !configured}
    <button
      type="button"
      onclick={toggleUpsell}
      aria-label="About FUTO Backups"
      aria-expanded={showUpsell}
      class="text-primary absolute end-3 top-1/2 -translate-y-1/2"
    >
      <Icon icon={mdiInformationOutline} size="1.25em" />
    </button>
  {/if}
</div>
