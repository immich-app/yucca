<script lang="ts">
  import { Text } from "@immich/ui";
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    content: string;
    compact?: boolean;
    subtitle?: Snippet;
  };

  const { title, content, compact = false, subtitle }: Props = $props();
</script>

<div>
  <Text color="secondary" class={compact ? "text-xs" : ""}>{title}</Text>
  <Text class={`tabular-nums ${compact ? "text-xl" : "text-2xl"}`}>
    {content}
  </Text>
  {#if subtitle}
    <Text color="secondary" class="text-xs">
      {@render subtitle()}
    </Text>
  {/if}
</div>
