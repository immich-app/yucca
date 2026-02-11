<script lang="ts">
  import {
    MockProvider,
    orchestrationApiProvider,
    setProvider,
  } from "$lib/providers.js";
  import { TooltipProvider } from "@immich/ui";
  import "./layout.css";

  const { children } = $props();

  setProvider(new MockProvider());
</script>

<TooltipProvider>
  {@render children()}
</TooltipProvider>
