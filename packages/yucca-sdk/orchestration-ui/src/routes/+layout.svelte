<script lang="ts">
  import { MockProvider, setProvider } from "$lib/providers.ts";
  import { TooltipProvider } from "@immich/ui";
  import "./layout.css";

  const { children } = $props();

  setProvider(new MockProvider());
</script>

<TooltipProvider>
  {@render children()}
</TooltipProvider>
