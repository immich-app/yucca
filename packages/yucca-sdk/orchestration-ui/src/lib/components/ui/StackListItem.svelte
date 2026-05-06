<script lang="ts">
  import { hasActions } from "$lib/utils/actions";
  import { ContextMenuButton, HStack, type ActionItem } from "@immich/ui";
  import { mdiDotsVertical } from "@mdi/js";
  import type { Snippet } from "svelte";

  type Props = {
    icon?: Snippet;
    children: Snippet;
    trailing?: Snippet;
    actions?: ActionItem[];
  };

  const { icon, children, trailing, actions = [] }: Props = $props();
</script>

<HStack gap={4} class="items-center px-4 py-3">
  {#if icon}
    <div
      class="flex h-10 w-10 items-center justify-center rounded-lg bg-subtle text-lg"
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
