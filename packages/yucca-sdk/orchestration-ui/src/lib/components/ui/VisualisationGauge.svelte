<script lang="ts">
  import { HStack, Icon, Stack, Text } from "@immich/ui";
  import type { Snippet } from "svelte";
  import IconTile from "./IconTile.svelte";

  type Props = {
    title: string;
    content: string;
    icon?: string;
    compact?: boolean;
    subtitle?: Snippet;
  };

  const { title, content, icon, compact = false, subtitle }: Props = $props();
</script>

<HStack gap={4} class="items-center">
  {#if icon}
    <IconTile><Icon {icon} /></IconTile>
  {/if}

  <Stack gap={0} class="min-w-0">
    <Text class={`tabular-nums ${compact ? "text-lg" : "text-xl"}`}>
      {content}
    </Text>
    <Text size="small" color="secondary">{title}</Text>
  </Stack>

  {#if subtitle}
    <div class="ms-auto">{@render subtitle()}</div>
  {/if}
</HStack>
