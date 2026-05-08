<script lang="ts">
  import { LoadingSpinner } from "@immich/ui";
  import { onMount, type Snippet } from "svelte";
  import SampleOnboarding from "./SampleOnboarding.svelte";
  import type { OnboardingStatusResponseDto } from "$lib/fetch-client";
  import { handleOnboardingStatus } from "$lib/services/onboarding.service";

  type Props = {
    flow?: "default" | "immich-restore";
    onExit: () => void;
    onFinish?: () => void;
    children: Snippet;
  };

  const { flow, onExit, onFinish, children }: Props = $props();

  let status: OnboardingStatusResponseDto | undefined = $state();

  onMount(() => {
    handleOnboardingStatus().then((data) => (status = data));
  });

  function onSkip() {
    status = {
      hasBackend: true,
      hasOnboardedKey: true,
      hasBackup: true,
      hasSchedule: true,
      hasSkippedExtraConfig: true,
    };
  }
</script>

{#if typeof status === "object"}
  {#if !(status.hasBackend && status.hasOnboardedKey && (status.hasSkippedExtraConfig || (status.hasBackup && status.hasSchedule)))}
    <SampleOnboarding
      {flow}
      {status}
      onFinish={() => (onFinish ? onFinish() : onSkip())}
      onCancel={() => {
        onSkip();
        onExit();
      }}
    />
  {:else}
    {@render children()}
  {/if}
{:else}
  <LoadingSpinner />
{/if}
