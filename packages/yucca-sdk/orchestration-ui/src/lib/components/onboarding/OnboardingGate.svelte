<script lang="ts">
  import { LoadingSpinner } from "@immich/ui";
  import { onMount, type Snippet } from "svelte";
  import Onboarding from "./Onboarding.svelte";
  import type { OnboardingStatusResponseDto } from "$lib/fetch-client";
  import { handleOnboardingStatus } from "$lib/services/onboarding.service";

  type Props = {
    flow?: "default" | "immich-setup" | "immich-restore";
    onExit: () => void;
    children: Snippet;
  };

  const { flow, onExit, children }: Props = $props();

  let status: OnboardingStatusResponseDto | undefined = $state();

  onMount(() => {
    handleOnboardingStatus().then((data) => (status = data));
  });
</script>

{#if typeof status === "object"}
  {#if !(status.hasBackend && status.hasOnboardedKey && (status.hasSkippedExtraConfig || (status.hasBackup && status.hasSchedule)))}
    <Onboarding
      {flow}
      {status}
      onFinish={() =>
        (status = {
          hasBackend: true,
          hasOnboardedKey: true,
          hasBackup: true,
          hasSchedule: true,
          hasSkippedExtraConfig: true,
        })}
      onCancel={onExit}
    />
  {:else}
    {@render children()}
  {/if}
{:else}
  <LoadingSpinner />
{/if}
