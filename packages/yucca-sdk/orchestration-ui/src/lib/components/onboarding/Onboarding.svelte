<script lang="ts">
  import type { OnboardingStatusResponseDto } from "$lib/fetch-client";
  import {
    handleConfirmRecoveryKey,
    handleCurrentRecoveryKey,
    handleSkipOnboardingExtraConfig,
  } from "$lib/services/onboarding.service";
  import { onMount } from "svelte";
  import BackupOptions from "./stages/BackupOptions.svelte";
  import ConfirmKey from "./stages/ConfirmKey.svelte";
  import KeyIntro from "./stages/KeyIntro.svelte";
  import SaveKey from "./stages/SaveKey.svelte";
  import Welcome from "./stages/Welcome.svelte";
  import ImportKey from "./stages/ImportKey.svelte";
  import CreateFirstBackup from "./stages/CreateFirstBackup.svelte";
  import CreateFirstSchedule from "./stages/CreateFirstSchedule.svelte";
  import CreateImmichBackup from "./stages/CreateImmichBackup.svelte";

  type Props = {
    flow?: "default" | "immich-setup" | "immich-restore";
    status: OnboardingStatusResponseDto;
    onFinish: () => void;
    onCancel: () => void;
  };

  let code = $state("");

  const { flow = "default", status, onFinish, onCancel }: Props = $props();
  const onNext = () => stage++;
  const onBack = () => stage--;
  const onStart = () => (stage = 0);
  const onImported = (key: string) => {
    code = key;
    stage = 2;
  };
  const onImportKey = () => (stage = 5);

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

  const onConfirmKey = async () => {
    await handleConfirmRecoveryKey();

    if (status.hasBackend) {
      onFinish();
    } else {
      onNext();
    }
  };

  const onSkip = () => {
    void handleSkipOnboardingExtraConfig();
    onFinish();
  };
</script>

{#if stage === 0}
  <Welcome {onNext} {onImportKey} {onCancel} />
{:else if stage === 1}
  <KeyIntro {onNext} {onCancel} />
{:else if stage === 2}
  <SaveKey {code} {onNext} {onCancel} />
{:else if stage === 3}
  <ConfirmKey {code} {onConfirmKey} {onBack} {onCancel} />
{:else if stage === 4}
  <BackupOptions {onCancel} />
{:else if stage === 5}
  <ImportKey {onStart} {onImported} {onCancel} />
{:else if flow === "default"}
  {#if stage === 6}
    <CreateFirstBackup {onNext} {onSkip} />
  {:else if stage === 7}
    <CreateFirstSchedule {onFinish} {onSkip} />
  {/if}
{:else if flow === "immich-setup"}
  {#if stage === 6}
    <CreateImmichBackup {onNext} {onSkip} />
  {/if}
{/if}
