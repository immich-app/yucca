<script lang="ts">
  import { TooltipProvider } from "@immich/ui";
  import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";

  const { children } = $props();
  const queryClient = new QueryClient();
</script>

<QueryClientProvider client={queryClient}>
  <TooltipProvider>
    {@render children()}
  </TooltipProvider>
</QueryClientProvider>
