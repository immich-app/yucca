<script lang="ts">
  import { TooltipProvider } from "@immich/ui";
  import { QueryClientProvider } from "@tanstack/svelte-query";
  import { defaults as orchestrationDefaults } from "$lib/fetch-client";
  import type { Snippet } from "svelte";

  type Props = {
    children: Snippet;
    baseUrl?: string;
  };

  const { baseUrl, children }: Props = $props();

  if (baseUrl) {
    orchestrationDefaults.baseUrl = baseUrl;
  }

  import { queryClient } from "$lib/query-client";
</script>

<QueryClientProvider client={queryClient}>
  <TooltipProvider>
    {@render children()}
  </TooltipProvider>
</QueryClientProvider>
