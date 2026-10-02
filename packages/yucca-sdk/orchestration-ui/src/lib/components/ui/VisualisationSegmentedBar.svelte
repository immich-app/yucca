<script lang="ts">
  import { HStack, Stack, Text } from "@immich/ui";

  type Segment = {
    value: number;
    label: string;
    color: string;
  };

  type Props = {
    segments: Segment[];
  };

  const { segments }: Props = $props();
</script>

<Stack gap={4}>
  <div class="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
    {#each segments as segment (segment.label)}
      {#if segment.value > 0}
        <div style="flex: {segment.value}; background: {segment.color};"></div>
      {/if}
    {/each}
  </div>

  <HStack gap={8} wrap>
    {#each segments as segment (segment.label)}
      {#if segment.value > 0}
        <HStack gap={3} class="items-center">
          <span
            class="size-4 shrink-0 rounded-sm"
            style="background: {segment.color};"
            aria-hidden="true"
          ></span>
          <Text>{segment.label} - {segment.value}</Text>
        </HStack>
      {/if}
    {/each}
  </HStack>
</Stack>
