<script lang="ts">
  import StepNumber from "$lib/components/ui/StepNumber.svelte";
  import { HStack, Stack, Text } from "@immich/ui";
  import OnboardingStepLayout, {
    type OnboardingStepAction,
  } from "./OnboardingStepLayout.svelte";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    onContinue: () => void;
    onImportKey?: () => void;
  };

  const { onContinue, onImportKey }: Props = $props();

  const steps = $derived([
    $t`Connect FUTO account`,
    $t`Save your recovery key`,
    $t`Start your first backup`,
  ]);

  const actions = $derived<OnboardingStepAction[]>([
    { label: $t`Continue`, onClick: () => onContinue() },
    {
      label: $t`Import key`,
      onClick: () => onImportKey?.(),
      $if: () => !!onImportKey,
    },
  ]);
</script>

<OnboardingStepLayout
  description={$t`Your subscription is active. Finish setup to create your recovery key and start backing up your Immich library.`}
  {actions}
>
  <Stack gap={3}>
    {#each steps as step, index (step)}
      <HStack gap={3} class="items-center">
        <StepNumber step={index + 1} size="small" />
        <Text size="small">{step}</Text>
      </HStack>
    {/each}
  </Stack>
</OnboardingStepLayout>
