<script lang="ts">
  import type { OnboardingStatusResponseDto } from "$lib/fetch-client";
  import { handleOnboardingStatus } from "$lib/services/onboarding.service";
  import { LoadingSpinner } from "@immich/ui";
  import { onMount, type Snippet } from "svelte";
  import OnboardingBootstrapError from "./OnboardingBootstrapError.svelte";
  import OnboardingLogin from "./OnboardingLogin.svelte";
  import SampleOnboarding from "./SampleOnboarding.svelte";

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
      requiresAuthentication: false,
      isAuthenticated: true,
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
{:else if onboarding.requiresAuthentication && !onboarding.isAuthenticated}
  <OnboardingLogin
    onAuthenticated={() => (onboarding!.isAuthenticated = true)}
  />
{:else if onboarding.hasTelemetry === "none" || !(onboarding.hasBackend && onboarding.hasOnboardedKey)}
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
