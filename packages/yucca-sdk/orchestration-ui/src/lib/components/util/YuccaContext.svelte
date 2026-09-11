<script lang="ts">
  import { TooltipProvider } from "@immich/ui";
  import { QueryClientProvider } from "@tanstack/svelte-query";
  import type { Snippet } from "svelte";

  type Props = {
    children: Snippet;
  };

  const { children }: Props = $props();

  import { queryClient } from "$lib/query-client";
</script>

<QueryClientProvider client={queryClient}>
  <TooltipProvider>
    {@render children()}
  </TooltipProvider>
</QueryClientProvider>
