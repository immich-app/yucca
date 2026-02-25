<script lang="ts">
  import {
    confirmRecoveryKey,
    currentRecoveryKey,
    type OnboardingStatusResponseDto,
  } from "$lib/fetch-client";
  import { onMount } from "svelte";
  import BackupOptions from "./stages/BackupOptions.svelte";
  import ConfirmKey from "./stages/ConfirmKey.svelte";
  import KeyIntro from "./stages/KeyIntro.svelte";
  import SaveKey from "./stages/SaveKey.svelte";
  import Welcome from "./stages/Welcome.svelte";
  import ImportKey from "./stages/ImportKey.svelte";

  type Props = {
    status: OnboardingStatusResponseDto;
    onFinish: () => void;
    onCancel: () => void;
  };

  let code = $state("");

  const { status, onFinish, onCancel }: Props = $props();
  const onNext = () => stage++;
  const onBack = () => stage--;
  const onStart = () => (stage = 0);
  const onImported = (key: string) => {
    code = key;
    stage = 2;
  };
  const onImportKey = () => (stage = 5);

  // svelte-ignore state_referenced_locally
  let stage = $state(status.hasOnboardedKey ? 4 : 0);

  onMount(() => {
    if (!status.hasOnboardedKey) {
      currentRecoveryKey().then((dto) => (code = dto.recoveryKey));
    }
  });

  const onConfirmKey = async () => {
    await confirmRecoveryKey();

    if (status.hasBackend) {
      onFinish();
    } else {
      onNext();
    }
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
  <BackupOptions {onFinish} {onCancel} />
{:else if stage === 5}
  <ImportKey {onStart} {onImported} {onCancel} />
{/if}
