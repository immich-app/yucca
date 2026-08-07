<script lang="ts">
  import { ProgressBar, Stack, Text } from "@immich/ui";
  import type { Snippet } from "svelte";

  type Props = {
    children?: Snippet;
  };

  const { children }: Props = $props();
</script>

<div class="bg-subtle overflow-hidden rounded-xl border">
  <Stack gap={1} class="p-4 border-b">
    <Text fontWeight="medium">Storage space</Text>
    <Text size="small" color="muted">22.1 GiB of 100 GiB used</Text>
    <ProgressBar
      progress={0.221}
      shape="round"
      size="tiny"
      class="mt-2 border-none"
    />
  </Stack>

  {@render children?.()}
</div>
