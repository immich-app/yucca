<script lang="ts">
  import { options } from "$lib/options";
  import {
    Button,
    ContextMenuButton,
    HStack,
    type ActionItem,
  } from "@immich/ui";
  import type { Snippet } from "svelte";

  type Props = {
    title?: string;
    actions?: ActionItem[];
    children?: Snippet;
  };

  const { title, actions = [], children }: Props = $props();
  const { demoPadding } = options;
</script>

<main class="absolute inset-0">
  {#if title || actions.length > 0}
    <div
      class="absolute top-0 left-0 flex h-16 w-full place-items-center justify-between border-b p-2 text-dark"
    >
      <div class="flex gap-2 items-center">
        {#if title}
          <div class="outline-none pe-8">{title}</div>
        {/if}
      </div>

      {#if actions.length > 0}
        <div class="hidden md:block">
          <HStack gap={0}>
            {#each actions as action, index (index)}
              {#if !action.$if || action.$if?.()}
                <Button
                  variant="ghost"
                  size="small"
                  color={action.color ?? "secondary"}
                  leadingIcon={action.icon}
                  onclick={() => action.onAction(action)}
                >
                  {action.title}
                </Button>
              {/if}
            {/each}
          </HStack>
        </div>

        <ContextMenuButton
          aria-label="Open"
          items={actions}
          class="md:hidden"
        />
      {/if}
    </div>
  {/if}

  <div
    class="absolute left-0 w-full overflow-y-auto {title || actions.length > 0
      ? 'top-16 h-[calc(100%-4rem)]'
      : 'top-0 h-full'} {$demoPadding ? 'p-4' : ''}"
  >
    {@render children?.()}
  </div>
</main>
