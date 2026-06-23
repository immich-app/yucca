<script lang="ts">
  import { LoadingSpinner } from "@immich/ui";
  import { onMount, type Snippet } from "svelte";
  import OnboardingBootstrapError from "./OnboardingBootstrapError.svelte";
  import SampleOnboarding from "./SampleOnboarding.svelte";
  import type { OnboardingStatusResponseDto } from "$lib/fetch-client";
  import { handleOnboardingStatus } from "$lib/services/onboarding.service";

  type Props = {
    onExit: () => void;
    onFinish?: () => void;
    children: Snippet;
  };

  const { onExit, onFinish, children }: Props = $props();

  let onboarding: OnboardingStatusResponseDto | undefined = $state();

  onMount(() => {
    handleOnboardingStatus().then((data) => (onboarding = data));
  });

  function onSkip() {
    onboarding = {
      status: "ready",
      hasTelemetry: "full",
      hasBackend: true,
      hasOnboardedKey: true,
      hasBackup: true,
      hasSchedule: true,
      hasSkippedExtraConfig: true,
    };
  }
</script>

{#if onboarding === undefined || onboarding.status === "not-ready"}
  <LoadingSpinner />
{:else if onboarding.status === "error"}
  <OnboardingBootstrapError error={onboarding.error} onQuit={onExit} />
{:else if onboarding.hasTelemetry === "none" || !(onboarding.hasBackend && onboarding.hasOnboardedKey && (onboarding.hasSkippedExtraConfig || (onboarding.hasBackup && onboarding.hasSchedule)))}
  <SampleOnboarding
    status={onboarding}
    onFinish={() => (onFinish ? onFinish() : onSkip())}
    onCancel={() => {
      onSkip();
      onExit();
    }}
  />
{:else}
  {@render children()}
{/if}
