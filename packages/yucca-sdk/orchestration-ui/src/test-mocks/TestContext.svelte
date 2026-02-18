<script>
  import { TooltipProvider } from "@immich/ui";
  import { MockProvider, setProvider } from "$lib/providers";

  const { children } = $props();

  setProvider(new MockProvider());
</script>

<TooltipProvider>
  {@render children()}
</TooltipProvider>