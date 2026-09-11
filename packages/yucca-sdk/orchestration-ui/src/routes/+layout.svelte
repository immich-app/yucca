<script lang="ts">
  import { configureYucca } from "$lib/providers";
  import { themeManager, ThemePreference, toastManager } from "@immich/ui";
  import { YuccaContext } from "$lib";
  import "./layout.css";

  const { children } = $props();

  configureYucca({ api: "orchestrator", baseUrl: "http://localhost:22676" });

  themeManager.setPreference(ThemePreference.Light);

  toastManager.setOptions({
    class: "fixed top-0 right-0 flex flex-col items-end justify-end gap-2 p-4",
  });
</script>

<div class="bg-light text-dark min-h-dvh">
  <YuccaContext>
    {@render children()}
  </YuccaContext>
</div>
