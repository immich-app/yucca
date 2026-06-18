<script lang="ts">
  import OnboardingBootstrapError from "$lib/components/onboarding/OnboardingBootstrapError.svelte";
  import OnboardingStageBackupServices from "$lib/components/onboarding/stages/OnboardingStageBackupServices.svelte";
  import OnboardingStageKeyImport from "$lib/components/onboarding/stages/OnboardingStageKeyImport.svelte";
  import OnboardingStageTelemetry from "$lib/components/onboarding/stages/OnboardingStageTelemetry.svelte";
  import RestorePointFlow from "$lib/components/onboarding/restore-point-flow/RestorePointFlow.svelte";
  import type { OnboardingStatusResponseDto } from "$lib/fetch-client";
  import {
    handleConfirmRecoveryKey,
    handleOnboardingStatus,
  } from "$lib/services/onboarding.service";
  import { LoadingSpinner } from "@immich/ui";
  import { onMount } from "svelte";

  type Props = {
    onExit: () => void;
    onFinish: () => void;
  };

  const { onExit, onFinish }: Props = $props();

  let status: OnboardingStatusResponseDto | undefined = $state();
  let stage:
    | "telemetry"
    | "key-import"
    | "backup-service"
    | "restore-point"
    | "key-reimport" = $state("key-import");

  onMount(() => {
    handleOnboardingStatus().then((data) => {
      status = data;

      if (data.status !== "ready") {
        return;
      }

      if (data.hasTelemetry === "none") {
        stage = "telemetry";
      } else if (data.hasOnboardedKey) {
        stage = data.hasBackend ? "restore-point" : "backup-service";
      }
    });
  });

  const onKeyImported = async () => {
    await handleConfirmRecoveryKey();
    stage = status?.hasBackend ? "restore-point" : "backup-service";
  };
</script>

{#if status === undefined || status.status === "not-ready"}
  <LoadingSpinner />
{:else if status.status === "error"}
  <OnboardingBootstrapError error={status.error} onQuit={onExit} />
{:else if stage === "telemetry"}
  <OnboardingStageTelemetry
    onContinue={() =>
      (stage = status?.hasOnboardedKey
        ? status.hasBackend
          ? "restore-point"
          : "backup-service"
        : "key-import")}
    onCancel={onExit}
  />
{:else if stage === "key-import"}
  <OnboardingStageKeyImport onImported={onKeyImported} onCancel={onExit} />
{:else if stage === "backup-service"}
  <OnboardingStageBackupServices
    onNext={() => (stage = "restore-point")}
    onCancel={onExit}
    restore
  />
{:else if stage === "key-reimport"}
  <OnboardingStageKeyImport
    onImported={() => (stage = "restore-point")}
    onCancel={() => (stage = "restore-point")}
  />
{:else if stage === "restore-point"}
  <RestorePointFlow
    onImportKey={() => (stage = "key-reimport")}
    onCancel={onExit}
    {onFinish}
  />
{/if}
