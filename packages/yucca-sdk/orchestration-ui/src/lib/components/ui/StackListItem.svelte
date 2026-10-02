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
  import { t } from "svelte-i18n-lingui";
  import IconTile, { tints, type TileColor } from "./IconTile.svelte";

  type Props = {
    class?: string;
    title?: string;
    color?: TileColor;
    icon?: Snippet;
    children: Snippet;
    trailing?: Snippet;
    footer?: Snippet;
    footerColor?: TileColor;
    actions?: ActionItem[];
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
  }: Props = $props();
</script>

<div>
  <HStack gap={4} class={`${className} items-center px-5 py-4`}>
    {#if icon}
      <IconTile {color}>{@render icon()}</IconTile>
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
        aria-label={$t`Options`}
        items={actions}
        variant="ghost"
        color="secondary"
      />
    {/if}
  </HStack>

  {#if footer}
    <HStack
      gap={2}
      class={`items-center border-t px-5 py-3 ${tints[footerColor]}`}
    >
      {@render footer()}
    </HStack>
  {/if}
</div>
