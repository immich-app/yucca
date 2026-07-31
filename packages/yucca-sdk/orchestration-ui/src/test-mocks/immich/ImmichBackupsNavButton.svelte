<script lang="ts">
  import { Icon, Text } from "@immich/ui";
  import {
    mdiCloudUpload,
    mdiCloudUploadOutline,
    mdiInformationOutline,
  } from "@mdi/js";
  import ImmichBackupsUpsellPopover from "./ImmichBackupsUpsellPopover.svelte";

  type Props = {
    configured: boolean;
    active?: boolean;
    href?: string;
    onclick?: () => void;
    class?: string;
  };

  const {
    configured,
    active = false,
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
    configured
      ? `flex w-full items-center gap-4 rounded-full px-4 py-2.5 text-start transition-colors ${active ? "bg-primary/10 text-primary" : "hover:bg-subtle"}`
      : "border-primary/40 from-primary/5 via-primary/15 to-primary/5 relative flex w-full items-center gap-4 overflow-hidden rounded-xl border bg-gradient-to-r ps-4 pe-10 py-2.5 text-start",
  );
</script>

{#snippet body()}
  <Icon
    icon={configured ? mdiCloudUploadOutline : mdiCloudUpload}
    size="1.5em"
    class="{configured ? '' : 'text-primary'} shrink-0"
  />

  <Text
    fontWeight="medium"
    color={configured && !active ? undefined : "primary"}
    class="flex-1"
  >
    {configured ? "Backups" : "Set up Backups"}
  </Text>

  {#if !configured}
    <span class="shine" aria-hidden="true"></span>
  {/if}
{/snippet}

<div class="relative {className ?? ''}">
  {#if showUpsell}
    <ImmichBackupsUpsellPopover
      placement="below"
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

<style>
  .shine {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      115deg,
      transparent 35%,
      color-mix(in srgb, white 55%, transparent) 50%,
      transparent 65%
    );
    transform: translateX(-130%);
    animation: shine-sweep 5s ease-in-out infinite;
  }

  @keyframes shine-sweep {
    0%,
    65% {
      transform: translateX(-130%);
    }
    100% {
      transform: translateX(130%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shine {
      animation: none;
      opacity: 0;
    }
  }
</style>
