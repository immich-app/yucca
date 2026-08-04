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

  type Stage =
    | `idle`
    | `welcome`
    | `telemetry`
    | `key-${"intro" | "save" | "confirm" | "import"}`
    | `backup-${"service" | "confirm" | "create"}`
    | `finished`;

  type Props = {
    fallback: Snippet<[() => void]>;
    children: Snippet;
  };

  const { fallback, children }: Props = $props();

  let code = $state("");
  let backendId = $state("");
  let status: OnboardingStatusResponseDto | undefined = $state();
  let stage: Stage = $state("idle");
  let resume: Stage = $state("welcome");

  onMount(() => {
    handleOnboardingStatus().then(async (data) => {
      status = data;

      if (data.status !== "ready") {
        return;
      }

      if (data.hasOnboardedKey) {
        if (data.hasBackup) {
          stage = "finished";
          return;
        }

        resume = data.hasTelemetry === "none" ? "telemetry" : "backup-service";
      } else {
        const { recoveryKey } = await handleCurrentRecoveryKey();
        code = recoveryKey;
      }
    });
  });

  const onStart = () => (stage = resume);
  const onCancel = () => (stage = "idle");

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
  <div class="flex h-full items-center justify-center p-8">
    <LoadingSpinner />
  </div>
{:else if stage === "finished"}
  {@render children()}
{:else}
  {@render fallback(onStart)}
{/if}

{#if status?.status === "error" && stage !== "idle"}
  <OnboardingBootstrapError error={status.error} onQuit={onCancel} />
{:else if stage === "welcome"}
  <OnboardingStageWelcome
    onNext={() =>
      (stage = status?.hasTelemetry === "none" ? "telemetry" : "key-intro")}
    onImportKey={() => (stage = "key-import")}
    {onCancel}
  />
{:else if stage === "telemetry"}
  <OnboardingStageTelemetry
    onContinue={() =>
      (stage = status?.hasOnboardedKey
        ? status.hasBackup
          ? "finished"
          : "backup-service"
        : "key-intro")}
    {onCancel}
  />
{:else if stage === "key-import"}
  <OnboardingStageKeyImport
    onStart={() => (stage = "welcome")}
    onImported={() => (stage = "key-confirm")}
    {onCancel}
  />
{:else if stage === "key-intro"}
  <OnboardingStageKeyIntro onNext={() => (stage = "key-save")} {onCancel} />
{:else if stage === "key-save"}
  <OnboardingStageSaveKey
    {code}
    onNext={() => (stage = "key-confirm")}
    {onCancel}
  />
{:else if stage === "key-confirm"}
  <OnboardingStageKeyConfirm
    {code}
    onBack={() => (stage = "key-save")}
    {onCancel}
    {onConfirmKey}
  />
{:else if stage === "backup-service"}
  <OnboardingStageBackupServices onNext={onSelectBackend} {onCancel} />
{:else if stage === "backup-confirm"}
  <ImmichConfirmDefaultBackup
    onCustomize={() => (stage = "backup-create")}
    onConfirm={() => (stage = "finished")}
    {onCancel}
  />
{:else if stage === "backup-create"}
  <ImmichConfigureBackup
    onFinish={() => (stage = "finished")}
    {onCancel}
    {backendId}
  />
{/if}
