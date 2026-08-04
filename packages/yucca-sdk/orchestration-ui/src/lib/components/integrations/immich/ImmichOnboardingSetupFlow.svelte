<script lang="ts">
  import OnboardingBootstrapError from "$lib/components/onboarding/OnboardingBootstrapError.svelte";
  import OnboardingStageKeyImport from "$lib/components/onboarding/stages/OnboardingStageKeyImport.svelte";
  import OnboardingStageTelemetry from "$lib/components/onboarding/stages/OnboardingStageTelemetry.svelte";
  import OnboardingStepFinishSetup from "$lib/components/onboarding/steps/OnboardingStep1FinishSetup.svelte";
  import OnboardingStepConnectAccount from "$lib/components/onboarding/steps/OnboardingStep2ConnectAccount.svelte";
  import OnboardingStepSaveRecoveryKey from "$lib/components/onboarding/steps/OnboardingStep3SaveRecoveryKey.svelte";
  import OnboardingStepFirstBackup from "$lib/components/onboarding/steps/OnboardingStep4FirstBackup.svelte";
  import type { OnboardingStatusResponseDto } from "$lib/fetch-client";
  import {
    handleSetupLocalStorage,
    handleStartYuccaLogin,
  } from "$lib/services/backend.service";
  import {
    IMMICH_DEFAULT_CRON,
    useConfigureImmichDefaults,
  } from "$lib/services/integrations.service";
  import {
    handleConfirmRecoveryKey,
    handleCurrentRecoveryKey,
    handleOnboardingStatus,
  } from "$lib/services/onboarding.service";
  import { LoadingSpinner, Modal, ModalBody } from "@immich/ui";
  import cronstrue from "cronstrue";
  import { onMount, type Snippet } from "svelte";

  type Stage =
    | "idle"
    | "intro"
    | "telemetry"
    | "connect"
    | "key-import"
    | "key"
    | "backup"
    | "finished";

  type Props = {
    fallback: Snippet<[() => void]>;
    children: Snippet;
  };

  const { fallback, children }: Props = $props();

  let code = $state("");
  let storageLocation = $state("FUTO Backups");
  let status: OnboardingStatusResponseDto | undefined = $state();
  let stage: Stage = $state("idle");
  let resume: Stage = $state("intro");
  let confirming = $state(false);

  const defaults = useConfigureImmichDefaults();

  const schedule = cronstrue.toString(IMMICH_DEFAULT_CRON, { verbose: true });

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

        resume = data.hasTelemetry === "none" ? "telemetry" : "connect";
      } else {
        const { recoveryKey } = await handleCurrentRecoveryKey();
        code = recoveryKey;
      }
    });
  });

  const onStart = () => (stage = resume);
  const onCancel = () => (stage = "idle");

  const afterTelemetry = () =>
    (stage = status?.hasOnboardedKey && status.hasBackup
      ? "finished"
      : "connect");

  const onBackendReady = () => (stage = status?.hasOnboardedKey ? "backup" : "key");

  const onConnect = () => {
    storageLocation = "FUTO Backups";
    handleStartYuccaLogin(onBackendReady);
  };

  const onLocalStorage = () => {
    storageLocation = "Local Storage";
    handleSetupLocalStorage(onBackendReady);
  };

  const onConfirmKey = async () => {
    confirming = true;

    try {
      await handleConfirmRecoveryKey();
      stage = "backup";
    } finally {
      confirming = false;
    }
  };

  const onStartBackup = () =>
    defaults.mutate(undefined, { onSuccess: () => (stage = "finished") });
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
{:else if stage === "intro"}
  <Modal size="small" title="FUTO Backups" onClose={onCancel}>
    <ModalBody>
      <OnboardingStepFinishSetup
        onContinue={() =>
          (stage = status?.hasTelemetry === "none" ? "telemetry" : "connect")}
        onImportKey={() => (stage = "key-import")}
      />
    </ModalBody>
  </Modal>
{:else if stage === "telemetry"}
  <OnboardingStageTelemetry onContinue={afterTelemetry} {onCancel} />
{:else if stage === "connect"}
  <Modal size="small" title="FUTO Backups" onClose={onCancel}>
    <ModalBody>
      <OnboardingStepConnectAccount {onConnect} {onLocalStorage} />
    </ModalBody>
  </Modal>
{:else if stage === "key-import"}
  <OnboardingStageKeyImport
    onStart={() => (stage = "intro")}
    onImported={() => (stage = "connect")}
    {onCancel}
  />
{:else if stage === "key"}
  <Modal size="small" title="FUTO Backups" onClose={onCancel}>
    <ModalBody>
      <OnboardingStepSaveRecoveryKey
        {code}
        onContinue={onConfirmKey}
        loading={confirming}
      />
    </ModalBody>
  </Modal>
{:else if stage === "backup"}
  <Modal size="small" title="FUTO Backups" onClose={onCancel}>
    <ModalBody>
      <OnboardingStepFirstBackup
        {schedule}
        {storageLocation}
        {onStartBackup}
        loading={defaults.isPending}
      />
    </ModalBody>
  </Modal>
{/if}
