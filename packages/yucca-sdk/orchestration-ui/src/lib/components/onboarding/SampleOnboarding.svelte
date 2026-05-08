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
  import Welcome from "./stages/OnboardingStageWelcome.svelte";

  type Props = {
    status: OnboardingStatusResponseDto;
    onFinish: () => void;
    onCancel: () => void;
  };

  let code = $state("");

  const { status, onFinish, onCancel }: Props = $props();
  const onNext = () => stage++;
  const onBack = () => stage--;

  // svelte-ignore state_referenced_locally
  let stage = $state(
    status.hasOnboardedKey
      ? status.hasBackend
        ? status.hasBackup
          ? 7
          : 6
        : 4
      : 0,
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
      onNext();
    }
  };
</script>

{#if stage === 0}
  <Welcome {onNext} onImportKey={() => (stage = 5)} {onCancel} />
{:else if stage === 1}
  <KeyIntro {onNext} {onCancel} />
{:else if stage === 2}
  <SaveKey {code} {onNext} {onCancel} />
{:else if stage === 3}
  <ConfirmKey {code} {onConfirmKey} {onBack} {onCancel} />
{:else if stage === 4}
  <BackupOptions onNext={() => (stage = 6)} {onCancel} />
{:else if stage === 5}
  <ImportKey
    onStart={() => (stage = 0)}
    onImported={(key) => {
      code = key;
      stage = 2;
    }}
    {onCancel}
  />
{:else if stage === 6}
  <CreateFirstBackup {onNext} {onSkip} />
{:else if stage === 7}
  <CreateFirstSchedule {onFinish} {onSkip} />
{/if}
