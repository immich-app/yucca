<script lang="ts">
  import { hasActions } from "$lib/utils/actions";
  import {
    ContextMenuButton,
    HStack,
    Stack,
    Text,
    type ActionItem,
  } from "@immich/ui";
  import { mdiDotsVertical } from "@mdi/js";
  import type { Snippet } from "svelte";

  type Color = "primary" | "success" | "warning" | "danger";

  type Props = {
    class?: string;
    title?: string;
    color?: Color;
    icon?: Snippet;
    children: Snippet;
    trailing?: Snippet;
    footer?: Snippet;
    footerColor?: Color;
    actions?: ActionItem[];
    disabled?: boolean;
    onclick?: () => void;
  };

  const {
    class: className,
    title,
    color = "primary",
    icon,
    children,
    trailing,
    footer,
    footerColor = "primary",
    actions = [],
    disabled = false,
    onclick,
  }: Props = $props();

  const tints: Record<Color, string> = {
    primary: "bg-primary-50 text-primary",
    success: "bg-success-50 text-success-700",
    warning: "bg-warning-50 text-warning-800",
    danger: "bg-danger-50 text-danger-700",
  };
</script>

{#snippet body()}
  <HStack gap={4} class={`${className} items-center px-5 py-4`}>
    {#if icon}
      <div
        class={`flex size-10 shrink-0 items-center justify-center rounded-lg text-xl ${tints[color]}`}
      >
        {@render icon()}
      </div>
    {/if}

    {#if title}
      <Stack gap={0} class="flex-1 min-w-0">
        <Text class="truncate">{title}</Text>
        <Text size="small" color="muted">{@render children()}</Text>
      </Stack>
    {:else}
      <HStack gap={1} class="flex-1 items-baseline">
        {@render children()}
      </HStack>
    {/if}

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

<div>
  {#if onclick}
    <button
      {onclick}
      {disabled}
      type="button"
      class="block w-full text-left hover:bg-subtle disabled:opacity-60"
    >
      {@render body()}
    </button>
  {:else}
    {@render body()}
  {/if}

  {#if footer}
    <HStack gap={2} class={`items-center border-t px-5 py-3 ${tints[footerColor]}`}>
      {@render footer()}
    </HStack>
  {/if}
</div>
