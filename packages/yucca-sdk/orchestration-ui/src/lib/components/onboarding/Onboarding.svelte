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
  import CreateImmichBackup from "../backups/dialogs/ConfigureImmichBackup.svelte";
  import RestorePointFlow from "./restore-point-flow/RestorePointFlow.svelte";

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

  // svelte-ignore state_referenced_locally
  let stage = $state(
    // immich-restore
    flow === "immich-restore"
      ? status.hasOnboardedKey
        ? status.hasBackend
          ? 2
          : 1
        : 0
      : // immich-setup & default
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

{#if flow === "immich-restore"}
  <!-- Immich Restore -->
  {#if stage === 0}
    <ImportKey
      onImported={(key) => {
        code = key;
        onConfirmKey();
      }}
      {onCancel}
    />
  {:else if stage === 1}
    <BackupOptions onNext={() => (stage = 2)} {onCancel} restore />
  {:else if stage === 10}
    <ImportKey onImported={() => (stage = 2)} onCancel={() => (stage = 2)} />
  {:else}
    <RestorePointFlow onImportKey={() => (stage = 10)} {onCancel} {onFinish} />
  {/if}
{:else if flow === "immich-setup"}
  <!-- Immich Setup -->
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
  {:else}
    <CreateImmichBackup onClose={onSkip} initialConfiguration />
  {/if}
{:else}
  <!-- Sample Flow -->
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
{/if}
