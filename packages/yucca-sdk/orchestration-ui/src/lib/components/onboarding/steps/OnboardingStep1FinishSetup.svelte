<script lang="ts">
  import StepNumber from "$lib/components/ui/StepNumber.svelte";
  import { HStack, Stack, Text } from "@immich/ui";
  import OnboardingStepLayout from "./OnboardingStepLayout.svelte";

  type Props = {
    onContinue: () => void;
  };

  const { onContinue }: Props = $props();

  const steps = [
    "Connect FUTO account",
    "Save your recovery key",
    "Start your first backup",
  ];
</script>

<OnboardingStepLayout
  title="Finish setting up FUTO Backups"
  description="Your subscription is active. Finish setup to create your recovery key and start backing up your Immich library."
  actionLabel="Continue"
  onAction={onContinue}
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
