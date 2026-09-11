<script>
  import { TooltipProvider } from "@immich/ui";
  import { orchestrationApiProvider, setProvider } from "$lib/providers";

  const { children } = $props();

  setProvider(orchestrationApiProvider);
</script>

<TooltipProvider>
  {@render children()}
</TooltipProvider>