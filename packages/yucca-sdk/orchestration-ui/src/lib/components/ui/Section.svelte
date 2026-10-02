<script lang="ts">
  import { Heading, HStack, Stack } from "@immich/ui";
  import type { Snippet } from "svelte";

  type Props = {
    title?: Snippet;
    action?: Snippet;
    children?: Snippet;
  };

  const { title, action, children }: Props = $props();
</script>

<Stack gap={2}>
  {#if title || action}
    <HStack class="items-center justify-between px-1">
      {#if title}
        <Heading tag="h2" size="tiny">{@render title()}</Heading>
      {/if}

      {@render action?.()}
    </HStack>
  {/if}

  {@render children?.()}
</Stack>
