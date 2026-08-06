<script lang="ts">
  import { options } from "$lib/options";
  import {
    Button,
    ContextMenuButton,
    HStack,
    IconButton,
    type ActionItem,
  } from "@immich/ui";
  import { mdiArrowLeft } from "@mdi/js";
  import type { Snippet } from "svelte";

  type Props = {
    title?: string;
    actions?: ActionItem[];
    onBack?: () => void;
    children?: Snippet;
  };

  const { title, actions = [], onBack, children }: Props = $props();
  const { demoPadding } = options;

  const hasHeader = $derived(Boolean(title) || actions.length > 0 || Boolean(onBack));
</script>

<main class="flex h-full w-full flex-col">
  {#if hasHeader}
    <div
      class="flex h-16 shrink-0 place-items-center justify-between border-b p-2 text-dark"
    >
      <div class="flex gap-2 items-center">
        {#if onBack}
          <IconButton
            icon={mdiArrowLeft}
            aria-label="Back"
            variant="ghost"
            color="secondary"
            shape="round"
            onclick={onBack}
          />
        {/if}

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

  <div class="min-h-0 grow overflow-y-auto {$demoPadding ? 'p-4' : ''}">
    {@render children?.()}
  </div>
</main>
