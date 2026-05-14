<script lang="ts">
  import { hasActions } from "$lib/utils/actions";
  import { ContextMenuButton, HStack, type ActionItem } from "@immich/ui";
  import { mdiDotsVertical } from "@mdi/js";
  import type { Snippet } from "svelte";

  type Props = {
    class?: string;
    icon?: Snippet;
    children: Snippet;
    trailing?: Snippet;
    actions?: ActionItem[];
    onclick?: () => void;
  };

  const {
    class: className,
    icon,
    children,
    trailing,
    actions = [],
    onclick,
  }: Props = $props();
</script>

{#snippet body()}
  <HStack gap={4} class={`${className} items-center px-4 py-3`}>
    {#if icon}
      <div
        class="flex p-2 items-center justify-center rounded-lg bg-subtle text-lg"
      >
        {@render icon?.()}
      </div>
    {/if}

    <HStack gap={1} class="flex-1 items-baseline">
      {@render children()}
    </HStack>

    {@render trailing?.()}

    {#if hasActions(actions)}
      <ContextMenuButton
        icon={mdiDotsVertical}
        aria-label="Options"
        items={actions}
        variant="ghost"
        color="secondary"
      />
    {/if}
  </HStack>
{/snippet}

{#if onclick}
  <button
    {onclick}
    type="button"
    class="block w-full text-left rounded-lg hover:bg-subtle focus-visible:outline-2 focus-visible:outline-primary-500 cursor-pointer"
  >
    {@render body()}
  </button>
{:else}
  {@render body()}
{/if}
