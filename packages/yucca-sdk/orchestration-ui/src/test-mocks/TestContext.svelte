<script>
  import { TooltipProvider } from "@immich/ui";
  import { configureYucca } from "$lib/providers";

  const { children } = $props();

  configureYucca({ api: "orchestrator" });
</script>

<TooltipProvider>
  {@render children()}
</TooltipProvider>
