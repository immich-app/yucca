<script lang="ts">
  import {
    MockProvider,
    orchestrationApiProvider,
    setProvider,
  } from "$lib/providers";
  import { toastManager, TooltipProvider } from "@immich/ui";
  import "./layout.css";

  const { children } = $props();

  setProvider(new MockProvider());

  toastManager.setOptions({
    class: "fixed top-0 right-0 flex flex-col items-end justify-end gap-2 p-4",
  });
</script>

<TooltipProvider>
  {@render children()}
</TooltipProvider>
