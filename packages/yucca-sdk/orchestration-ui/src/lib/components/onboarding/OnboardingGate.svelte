<script lang="ts">
  import { LoadingSpinner } from "@immich/ui";
  import { onMount, type Snippet } from "svelte";
  import Onboarding from "./Onboarding.svelte";
  import { getBackends } from "$lib/fetch-client";

  type Props = {
    onExit: () => void;
    children: Snippet;
  };

  const { onExit, children }: Props = $props();

  let needsOnboarding: boolean | undefined = $state();

  onMount(() => {
    // replace with actual logic
    getBackends().then(
      (data) => (needsOnboarding = data.backends.length === 0),
    );
  });
</script>

{#if typeof needsOnboarding === "boolean"}
  {#if needsOnboarding}
    <Onboarding onFinish={() => (needsOnboarding = false)} onCancel={onExit} />
  {:else}
    {@render children()}
  {/if}
{:else}
  <LoadingSpinner />
{/if}
