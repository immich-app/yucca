<script lang="ts">
  import type { OnboardingStatusResponseDto } from "$lib/fetch-client";
  import {
    handleSetupLocalStorage,
    handleStartYuccaLogin,
  } from "$lib/services/backend.service";
  import {
    handleConfirmRecoveryKey,
    handleCurrentRecoveryKey,
    handleSkipOnboardingExtraConfig,
  } from "$lib/services/onboarding.service";
  import { Modal, ModalBody } from "@immich/ui";
  import { onMount } from "svelte";
  import CreateFirstBackup from "./stages/SampleCreateFirstBackup.svelte";
  import CreateFirstSchedule from "./stages/SampleCreateFirstSchedule.svelte";
  import ImportKey from "./stages/OnboardingStageKeyImport.svelte";
  import Telemetry from "./stages/OnboardingStageTelemetry.svelte";
  import StepFinishSetup from "./steps/OnboardingStep1FinishSetup.svelte";
  import StepConnectAccount from "./steps/OnboardingStep2ConnectAccount.svelte";
  import StepSaveRecoveryKey from "./steps/OnboardingStep3SaveRecoveryKey.svelte";

  type Props = {
    status: OnboardingStatusResponseDto;
    onFinish: () => void;
    onCancel: () => void;
  };

  const { status, onFinish, onCancel }: Props = $props();

  let code = $state("");
  let confirming = $state(false);

  // svelte-ignore state_referenced_locally
  let stage:
    | "intro"
    | "telemetry"
    | "key"
    | "key-import"
    | "connect"
    | "backup-create"
    | "schedule-create" = $state(
    !status.hasOnboardedKey
      ? "intro"
      : status.hasTelemetry === "none"
        ? "telemetry"
        : !status.hasBackend
          ? "connect"
          : !status.hasBackup
            ? "backup-create"
            : "schedule-create",
  );

  onMount(() => {
    if (!status.hasOnboardedKey) {
      handleCurrentRecoveryKey().then((dto) => (code = dto.recoveryKey));
    }
  });

  const onSkip = () => {
    void handleSkipOnboardingExtraConfig();
    onFinish();
  };

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

  const onBackendReady = () => (stage = "backup-create");
</script>

{#if stage === "intro"}
  <Modal size="small" title="FUTO Backups" onClose={onCancel}>
    <ModalBody>
      <StepFinishSetup
        onContinue={() =>
          (stage = status.hasTelemetry === "none" ? "telemetry" : "key")}
        onImportKey={() => (stage = "key-import")}
      />
    </ModalBody>
  </Modal>
{:else if stage === "telemetry"}
  <Telemetry
    onContinue={() =>
      (stage = !status.hasOnboardedKey
        ? "key"
        : !status.hasBackend
          ? "connect"
          : !status.hasBackup
            ? "backup-create"
            : "schedule-create")}
    {onCancel}
  />
{:else if stage === "key"}
  <Modal size="small" title="FUTO Backups" onClose={onCancel}>
    <ModalBody>
      <StepSaveRecoveryKey {code} onContinue={onConfirmKey} loading={confirming} />
    </ModalBody>
  </Modal>
{:else if stage === "key-import"}
  <ImportKey
    onStart={() => (stage = "intro")}
    onImported={(key) => {
      code = key;
      stage = "key";
    }}
    {onCancel}
  />
{:else if stage === "connect"}
  <Modal size="small" title="FUTO Backups" onClose={onCancel}>
    <ModalBody>
      <StepConnectAccount
        onConnect={() => handleStartYuccaLogin(onBackendReady)}
        onLocalStorage={() => handleSetupLocalStorage(onBackendReady)}
      />
    </ModalBody>
  </Modal>
{:else if stage === "backup-create"}
  <CreateFirstBackup onNext={() => (stage = "schedule-create")} {onSkip} />
{:else if stage === "schedule-create"}
  <CreateFirstSchedule {onFinish} {onSkip} />
{/if}
