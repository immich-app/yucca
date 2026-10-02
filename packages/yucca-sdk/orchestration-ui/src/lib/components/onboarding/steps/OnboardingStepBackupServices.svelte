<script lang="ts">
  import StackList from "$lib/components/ui/StackList.svelte";
  import StackListOption from "$lib/components/ui/StackListOption.svelte";
  import {
    handleSetupLocalStorage,
    handleStartYuccaLogin,
  } from "$lib/services/backend.service";
  import { Icon } from "@immich/ui";
  import { mdiHarddisk, mdiShieldCheck } from "@mdi/js";
  import { t } from "svelte-i18n-lingui";
  import OnboardingStepLayout, {
    type OnboardingStepAction,
  } from "./OnboardingStepLayout.svelte";

  type Props = {
    onNext: (backendId: string) => void;
    onCancel: () => void;
  };

  const { onNext, onCancel }: Props = $props();

  const actions = $derived<OnboardingStepAction[]>([
    { label: $t`Cancel`, onClick: onCancel, variant: "ghost" },
  ]);

  // TODO: show existing backends if any configured!
</script>

<OnboardingStepLayout {actions} badge={false}>
  <StackList>
    <StackListOption
      title={$t`FUTO Backups`}
      onclick={() => handleStartYuccaLogin(onNext)}
    >
      {#snippet icon()}
        <Icon icon={mdiShieldCheck} />
      {/snippet}

      {$t`Simple, hosted backups.`}
    </StackListOption>
    <StackListOption
      title={$t`Local Storage`}
      onclick={() => handleSetupLocalStorage(onNext)}
    >
      {#snippet icon()}
        <Icon icon={mdiHarddisk} />
      {/snippet}

      {$t`A folder on this computer.`}
    </StackListOption>
  </StackList>
</OnboardingStepLayout>
