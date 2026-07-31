<script lang="ts">
  import { HStack, ProgressBar, Stack, Text } from "@immich/ui";
  import type { Snippet } from "svelte";

  type Props = {
    children: Snippet;
  };

  const { children }: Props = $props();
</script>

<Stack gap={4} class="bg-light w-80 shrink-0 rounded-2xl border p-4">
  <Stack gap={1} class="bg-subtle rounded-xl p-4">
    <Text fontWeight="medium">Storage space</Text>
    <Text size="small" color="muted">22.1 GiB of 100 GiB used</Text>
    <ProgressBar
      progress={0.221}
      shape="round"
      size="tiny"
      class="mt-2 border-none"
    />
  </Stack>

  {@render children()}

  <HStack gap={2}>
    <span class="bg-success size-2 rounded-full"></span>
    <Text size="small" class="flex-1">Server Online</Text>
    <Text size="small" color="muted">v3.0.3</Text>
  </HStack>
</Stack>
