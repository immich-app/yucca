<script lang="ts">
  import OnboardingBootstrapError from "$lib/components/onboarding/OnboardingBootstrapError.svelte";
  import OnboardingStepChooseStorage from "$lib/components/onboarding/steps/OnboardingStepChooseStorage.svelte";
  import OnboardingStepConnectAccount from "$lib/components/onboarding/steps/OnboardingStep2ConnectAccount.svelte";
  import OnboardingStepSaveRecoveryKey from "$lib/components/onboarding/steps/OnboardingStep3SaveRecoveryKey.svelte";
  import OnboardingStepConfirmRecoveryKey from "$lib/components/onboarding/steps/OnboardingStepConfirmRecoveryKey.svelte";
  import OnboardingStepFirstBackup from "$lib/components/onboarding/steps/OnboardingStep4FirstBackup.svelte";
  import OnboardingStepModal from "$lib/components/onboarding/steps/OnboardingStepModal.svelte";
  import OnboardingStepTelemetry from "$lib/components/onboarding/steps/OnboardingStepTelemetry.svelte";
  import { type OnboardingStatusResponseDto } from "$lib/fetch-client";
  import { handleStartYuccaLogin } from "$lib/services/backend.service";
  import {
    IMMICH_DEFAULT_CRON,
    useConfigureAndStartImmichIntegration,
  } from "$lib/services/integrations.service";
  import {
    handleConfirmRecoveryKey,
    handleCurrentRecoveryKey,
    handleOnboardingStatus,
  } from "$lib/services/onboarding.service";
  import { handleCreateBackup } from "$lib/services/repository.service";
  import { LoadingSpinner } from "@immich/ui";
  import cronstrue from "cronstrue";
  import { onMount, type Snippet } from "svelte";
  import { t } from "svelte-i18n-lingui";

  type Stage =
    | "idle"
    | "telemetry"
    | "storage"
    | "connect"
    | "key"
    | "key-confirm"
    | "backup"
    | "finished";

  type Props = {
    fallback: Snippet<[() => void]>;
    children: Snippet;
  };

  const { fallback, children }: Props = $props();

  let code = $state("");
  let status: OnboardingStatusResponseDto | undefined = $state();
  let stage: Stage = $state("idle");
  let resume: Stage = $state("storage");
  let confirming = $state(false);

  const defaults = useConfigureAndStartImmichIntegration();

  const schedule = cronstrue.toString(IMMICH_DEFAULT_CRON, { verbose: true });

  onMount(() => {
    handleOnboardingStatus().then(async (data) => {
      status = data;

      if (data.status !== "ready") {
        return;
      }

      resume = data.hasTelemetry === "none" ? "telemetry" : "storage";

      if (data.hasOnboardedKey) {
        if (data.hasBackup) {
          stage = "finished";
          return;
        }
      } else {
        const { recoveryKey } = await handleCurrentRecoveryKey();
        code = recoveryKey;
      }
    });
  });

  const onStart = () => (stage = resume);
  const onCancel = () => (stage = "idle");

  const afterTelemetry = () =>
    (stage =
      status?.hasOnboardedKey && status.hasBackup ? "finished" : "storage");

  const onBackendReady = () =>
    (stage = status?.hasOnboardedKey ? "backup" : "key");

  const onConnect = () => {
    handleStartYuccaLogin(onBackendReady);
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
    defaults.mutate(undefined, { onSuccess: ({ repositoryId }) => {
        stage = "finished";
        handleCreateBackup(repositoryId).catch(() => void 0);
      }
    });
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
{:else if stage === "telemetry"}
  <OnboardingStepModal
    title={$t`Telemetry required for closed beta`}
    onClose={onCancel}
  >
    <OnboardingStepTelemetry onContinue={afterTelemetry} {onCancel} />
  </OnboardingStepModal>
{:else if stage === "storage"}
  <OnboardingStepModal
    title={$t`Choose where your backups live`}
    size="giant"
    onClose={onCancel}
  >
    <OnboardingStepChooseStorage onConfirm={() => (stage = "connect")} />
  </OnboardingStepModal>
{:else if stage === "connect"}
  <OnboardingStepModal
    title={$t`Connect your FUTO account`}
    onClose={onCancel}
  >
    <OnboardingStepConnectAccount {onConnect} />
  </OnboardingStepModal>
{:else if stage === "key"}
  <OnboardingStepModal title={$t`Save your recovery key`} onClose={onCancel}>
    <OnboardingStepSaveRecoveryKey
      {code}
      onContinue={() => (stage = "key-confirm")}
    />
  </OnboardingStepModal>
{:else if stage === "key-confirm"}
  <OnboardingStepModal
    title={$t`Confirm your recovery key`}
    onClose={onCancel}
  >
    <OnboardingStepConfirmRecoveryKey
      {code}
      loading={confirming}
      onConfirm={onConfirmKey}
      onBack={() => (stage = "key")}
    />
  </OnboardingStepModal>
{:else if stage === "backup"}
  <OnboardingStepModal title={$t`Start your first backup`} onClose={onCancel}>
    <OnboardingStepFirstBackup
      {schedule}
      storageLocation={$t`FUTO Cloud`}
      {onStartBackup}
      loading={defaults.isPending}
    />
  </OnboardingStepModal>
{/if}
