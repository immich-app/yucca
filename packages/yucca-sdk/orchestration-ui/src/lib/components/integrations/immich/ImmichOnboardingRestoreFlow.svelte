<script lang="ts">
  import OnboardingStageBackupServices from "$lib/components/onboarding/stages/OnboardingStageBackupServices.svelte";
  import OnboardingStageKeyImport from "$lib/components/onboarding/stages/OnboardingStageKeyImport.svelte";
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
    | "key-import"
    | "backup-service"
    | "restore-point"
    | "key-reimport" = $state("key-import");

  onMount(() => {
    handleOnboardingStatus().then((data) => {
      status = data;

      if (data.hasOnboardedKey) {
        if (data.hasBackend) {
          stage = "restore-point";
        } else {
          stage = "backup-service";
        }
      }
    });
  });

  const onKeyImported = async () => {
    await handleConfirmRecoveryKey();

    if (status?.hasBackend) {
      stage = "restore-point";
    } else {
      stage = "backup-service";
    }
  };
</script>

{#if typeof status === "object"}
  {#if stage === "key-import"}
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
{:else}
  <LoadingSpinner />
{/if}
