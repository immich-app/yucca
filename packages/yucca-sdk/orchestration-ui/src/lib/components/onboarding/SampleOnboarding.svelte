<script lang="ts">
  import type { OnboardingStatusResponseDto } from "$lib/fetch-client";
  import {
    handleConfirmRecoveryKey,
    handleCurrentRecoveryKey,
    handleSkipOnboardingExtraConfig,
  } from "$lib/services/onboarding.service";
  import { onMount } from "svelte";
  import CreateFirstBackup from "./stages/SampleCreateFirstBackup.svelte";
  import CreateFirstSchedule from "./stages/SampleCreateFirstSchedule.svelte";
  import BackupOptions from "./stages/OnboardingStageBackupServices.svelte";
  import ConfirmKey from "./stages/OnboardingStageKeyConfirm.svelte";
  import ImportKey from "./stages/OnboardingStageKeyImport.svelte";
  import KeyIntro from "./stages/OnboardingStageKeyIntro.svelte";
  import SaveKey from "./stages/OnboardingStageKeySave.svelte";
  import Telemetry from "./stages/OnboardingStageTelemetry.svelte";
  import Welcome from "./stages/OnboardingStageWelcome.svelte";

  type Props = {
    status: OnboardingStatusResponseDto;
    onFinish: () => void;
    onCancel: () => void;
  };

  const { status, onFinish, onCancel }: Props = $props();

  let code = $state("");

  // svelte-ignore state_referenced_locally
  let stage:
    | "welcome"
    | "telemetry"
    | `key-${"intro" | "save" | "confirm" | "import"}`
    | "backup-service"
    | "backup-create"
    | "schedule-create" = $state(
    !status.hasOnboardedKey
      ? "welcome"
      : status.hasTelemetry === "none"
        ? "telemetry"
        : !status.hasBackend
          ? "backup-service"
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
    await handleConfirmRecoveryKey();

    if (status.hasBackend) {
      onFinish();
    } else {
      stage = "backup-service";
    }
  };
</script>

{#if stage === "welcome"}
  <Welcome
    onNext={() => (stage = status.hasTelemetry === "none" ? "telemetry" : "key-intro")}
    onImportKey={() => (stage = "key-import")}
    {onCancel}
  />
{:else if stage === "telemetry"}
  <Telemetry
    onContinue={() =>
      (stage = !status.hasOnboardedKey
        ? "key-intro"
        : !status.hasBackend
          ? "backup-service"
          : !status.hasBackup
            ? "backup-create"
            : "schedule-create")}
    {onCancel}
  />
{:else if stage === "key-intro"}
  <KeyIntro onNext={() => (stage = "key-save")} {onCancel} />
{:else if stage === "key-save"}
  <SaveKey {code} onNext={() => (stage = "key-confirm")} {onCancel} />
{:else if stage === "key-confirm"}
  <ConfirmKey
    {code}
    {onConfirmKey}
    onBack={() => (stage = "key-save")}
    {onCancel}
  />
{:else if stage === "key-import"}
  <ImportKey
    onStart={() => (stage = "welcome")}
    onImported={(key) => {
      code = key;
      stage = "key-save";
    }}
    {onCancel}
  />
{:else if stage === "backup-service"}
  <BackupOptions onNext={() => (stage = "backup-create")} {onCancel} />
{:else if stage === "backup-create"}
  <CreateFirstBackup onNext={() => (stage = "schedule-create")} {onSkip} />
{:else if stage === "schedule-create"}
  <CreateFirstSchedule {onFinish} {onSkip} />
{/if}
