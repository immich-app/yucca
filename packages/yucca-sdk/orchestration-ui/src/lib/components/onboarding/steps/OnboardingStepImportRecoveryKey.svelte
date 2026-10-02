<script lang="ts">
  import { handleImportRecoveryKey } from "$lib/services/onboarding.service";
  import { Field, Input } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";
  import OnboardingStepLayout, {
    type OnboardingStepAction,
  } from "./OnboardingStepLayout.svelte";

  type Props = {
    onImported: (key: string) => void;
    onBack?: () => void;
    onCancel: () => void;
  };

  const { onImported, onBack, onCancel }: Props = $props();

  let value = $state("");

  const recoveryKey = $derived(value.replace(/\s/g, "").toLowerCase());

  const onSave = async () => {
    await handleImportRecoveryKey({ recoveryKey });
    onImported(recoveryKey);
  };

  const actions = $derived<OnboardingStepAction[]>([
    {
      label: $t`Save`,
      onClick: () => void onSave(),
      disabled: !/^[a-f0-9]{64}$/.test(recoveryKey),
    },
    onBack
      ? { label: $t`Back`, onClick: onBack }
      : { label: $t`Cancel`, onClick: onCancel },
  ]);
</script>

<OnboardingStepLayout {actions} badge={false}>
  <Field label={$t`Recovery Key`}>
    <Input bind:value />
  </Field>
</OnboardingStepLayout>
