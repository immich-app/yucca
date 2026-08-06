<script lang="ts">
  import StepNumber from "$lib/components/ui/StepNumber.svelte";
  import { HStack, Stack, Text } from "@immich/ui";
  import OnboardingStepLayout, {
    type OnboardingStepAction,
  } from "./OnboardingStepLayout.svelte";

  type Props = {
    onContinue: () => void;
    onImportKey?: () => void;
  };

  const { onContinue, onImportKey }: Props = $props();

  const steps = [
    "Connect FUTO account",
    "Save your recovery key",
    "Start your first backup",
  ];

  const actions: OnboardingStepAction[] = [
    { label: "Continue", onClick: () => onContinue() },
    {
      label: "Import key",
      onClick: () => onImportKey?.(),
      $if: () => !!onImportKey,
    },
  ];
</script>

<OnboardingStepLayout
  title="Finish setting up FUTO Backups"
  description="Your subscription is active. Finish setup to create your recovery key and start backing up your Immich library."
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
