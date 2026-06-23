<script lang="ts">
  import OnboardingBootstrapError from "$lib/components/onboarding/OnboardingBootstrapError.svelte";
  import OnboardingStageBackupServices from "$lib/components/onboarding/stages/OnboardingStageBackupServices.svelte";
  import OnboardingStageKeyConfirm from "$lib/components/onboarding/stages/OnboardingStageKeyConfirm.svelte";
  import OnboardingStageKeyImport from "$lib/components/onboarding/stages/OnboardingStageKeyImport.svelte";
  import OnboardingStageKeyIntro from "$lib/components/onboarding/stages/OnboardingStageKeyIntro.svelte";
  import OnboardingStageSaveKey from "$lib/components/onboarding/stages/OnboardingStageKeySave.svelte";
  import OnboardingStageTelemetry from "$lib/components/onboarding/stages/OnboardingStageTelemetry.svelte";
  import OnboardingStageWelcome from "$lib/components/onboarding/stages/OnboardingStageWelcome.svelte";
  import type { OnboardingStatusResponseDto } from "$lib/fetch-client";
  import {
    handleConfirmRecoveryKey,
    handleCurrentRecoveryKey,
    handleOnboardingStatus,
  } from "$lib/services/onboarding.service";
  import { LoadingSpinner } from "@immich/ui";
  import { onMount, type Snippet } from "svelte";
  import ImmichConfigureBackup from "./ImmichConfigureBackup.svelte";
  import ImmichConfirmDefaultBackup from "./ImmichConfirmDefaultBackup.svelte";

  type Props = {
    onExit: () => void;
    children: Snippet;
  };

  const { onExit, children }: Props = $props();

  let code = $state("");
  let backendId = $state("");
  let status: OnboardingStatusResponseDto | undefined = $state();
  let stage:
    | `welcome`
    | `telemetry`
    | `key-${"intro" | "save" | "confirm" | "import"}`
    | `backup-${"service" | "confirm" | "create"}`
    | `finished` = $state("welcome");

  onMount(() => {
    handleOnboardingStatus().then(async (data) => {
      status = data;

      if (data.status !== "ready") {
        return;
      }

      if (data.hasOnboardedKey) {
        stage =
          data.hasTelemetry === "none"
            ? "telemetry"
            : data.hasBackup
              ? "finished"
              : "backup-service";
      } else {
        const { recoveryKey } = await handleCurrentRecoveryKey();
        code = recoveryKey;
      }
    });
  });

  const onConfirmKey = async () => {
    await handleConfirmRecoveryKey();
    stage = "backup-service";
  };

  const onSelectBackend = (id: string) => {
    backendId = id;
    stage = "backup-confirm";
  };
</script>

{#if status === undefined || status.status === "not-ready"}
  <LoadingSpinner />
{:else if status.status === "error"}
  <OnboardingBootstrapError error={status.error} onQuit={onExit} />
{:else if stage === "finished"}
  {@render children()}
{:else if stage === "welcome"}
  <OnboardingStageWelcome
    onNext={() => (stage = status?.hasTelemetry === "none" ? "telemetry" : "key-intro")}
    onImportKey={() => (stage = "key-import")}
    onCancel={onExit}
  />
{:else if stage === "telemetry"}
  <OnboardingStageTelemetry
    onContinue={() =>
      (stage = status?.hasOnboardedKey
        ? status.hasBackup
          ? "finished"
          : "backup-service"
        : "key-intro")}
    onCancel={onExit}
  />
{:else if stage === "key-import"}
  <OnboardingStageKeyImport
    onStart={() => (stage = "welcome")}
    onImported={() => (stage = "key-confirm")}
    onCancel={onExit}
  />
{:else if stage === "key-intro"}
  <OnboardingStageKeyIntro
    onNext={() => (stage = "key-save")}
    onCancel={onExit}
  />
{:else if stage === "key-save"}
  <OnboardingStageSaveKey
    {code}
    onNext={() => (stage = "key-confirm")}
    onCancel={onExit}
  />
{:else if stage === "key-confirm"}
  <OnboardingStageKeyConfirm
    {code}
    onBack={() => (stage = "key-save")}
    onCancel={onExit}
    {onConfirmKey}
  />
{:else if stage === "backup-service"}
  <OnboardingStageBackupServices onNext={onSelectBackend} onCancel={onExit} />
{:else if stage === "backup-confirm"}
  <ImmichConfirmDefaultBackup
    onCustomize={() => (stage = "backup-create")}
    onConfirm={() => (stage = "finished")}
    onCancel={onExit}
  />
{:else if stage === "backup-create"}
  <ImmichConfigureBackup
    onFinish={() => (stage = "finished")}
    onCancel={onExit}
    {backendId}
  />
{/if}
