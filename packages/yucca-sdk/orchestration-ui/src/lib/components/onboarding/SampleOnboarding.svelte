<script lang="ts">
  import type { OnboardingStatusResponseDto } from "$lib/fetch-client";
  import {
    handleSetupLocalStorage,
    handleStartYuccaLogin,
  } from "$lib/services/backend.service";
  import {
    handleConfirmRecoveryKey,
    handleCurrentRecoveryKey,
  } from "$lib/services/onboarding.service";
  import { onMount } from "svelte";
  import StepFinishSetup from "./steps/OnboardingStep1FinishSetup.svelte";
  import StepConnectAccount from "./steps/OnboardingStep2ConnectAccount.svelte";
  import StepImportRecoveryKey from "./steps/OnboardingStepImportRecoveryKey.svelte";
  import StepModal from "./steps/OnboardingStepModal.svelte";
  import StepSaveRecoveryKey from "./steps/OnboardingStep3SaveRecoveryKey.svelte";
  import StepTelemetry from "./steps/OnboardingStepTelemetry.svelte";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    status: OnboardingStatusResponseDto;
    onFinish: () => void;
    onCancel: () => void;
  };

  const { status, onFinish, onCancel }: Props = $props();

  let code = $state("");
  let confirming = $state(false);

  // svelte-ignore state_referenced_locally
  let stage: "intro" | "telemetry" | "key" | "key-import" | "connect" = $state(
    !status.hasOnboardedKey
      ? "intro"
      : status.hasTelemetry === "none"
        ? "telemetry"
        : "connect",
  );

  onMount(() => {
    if (!status.hasOnboardedKey) {
      handleCurrentRecoveryKey().then((dto) => (code = dto.recoveryKey));
    }
  });

  const onConfirmKey = async () => {
    confirming = true;

    try {
      await handleConfirmRecoveryKey();

      if (status.hasBackend) {
        onFinish();
      } else {
        stage = "connect";
      }
    } finally {
      confirming = false;
    }
  };

  const onTelemetryConfirmed = () => {
    if (!status.hasOnboardedKey) {
      stage = "key";
    } else if (status.hasBackend) {
      onFinish();
    } else {
      stage = "connect";
    }
  };
</script>

{#if stage === "intro"}
  <StepModal title={$t`Finish setting up FUTO Backups`} onClose={onCancel}>
    <StepFinishSetup
      onContinue={() =>
        (stage = status.hasTelemetry === "none" ? "telemetry" : "key")}
      onImportKey={() => (stage = "key-import")}
    />
  </StepModal>
{:else if stage === "telemetry"}
  <StepModal
    title={$t`Telemetry required for closed beta`}
    onClose={onCancel}
  >
    <StepTelemetry onContinue={onTelemetryConfirmed} {onCancel} />
  </StepModal>
{:else if stage === "key"}
  <StepModal title={$t`Save your recovery key`} onClose={onCancel}>
    <StepSaveRecoveryKey
      {code}
      onContinue={onConfirmKey}
      loading={confirming}
    />
  </StepModal>
{:else if stage === "key-import"}
  <StepModal title={$t`Import recovery key`} onClose={onCancel}>
    <StepImportRecoveryKey
      onBack={() => (stage = "intro")}
      onImported={(key) => {
        code = key;
        stage = "key";
      }}
      {onCancel}
    />
  </StepModal>
{:else if stage === "connect"}
  <StepModal title={$t`Connect your FUTO account`} onClose={onCancel}>
    <StepConnectAccount
      onConnect={() => handleStartYuccaLogin(onFinish)}
      onLocalStorage={() => handleSetupLocalStorage(onFinish)}
    />
  </StepModal>
{/if}
