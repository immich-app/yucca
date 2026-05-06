<script lang="ts">
  import { Heading, Stack } from "@immich/ui";
  import type { Snippet } from "svelte";

  type Props = {
    title?: Snippet;
    children: Snippet;
  };

  const { title, children }: Props = $props();
</script>

<Stack gap={2}>
  {#if title}
    <Stack gap={0} class="px-1">
      <Heading size="tiny" tag="h2">{@render title()}</Heading>
    </Stack>
  {/if}

  <Stack gap={0} class="divide-y rounded-2xl border">
    {@render children()}
  </Stack>
</Stack>
