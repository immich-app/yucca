<script lang="ts">
  import RecoveryKeyDisplay from "$lib/components/onboarding/RecoveryKeyDisplay.svelte";
  import { Checkbox, HStack, Stack, Text } from "@immich/ui";
  import OnboardingStepLayout, {
    type OnboardingStepAction,
  } from "./OnboardingStepLayout.svelte";

  type Props = {
    code: string;
    onContinue: () => void;
    loading?: boolean;
  };

  const { code, onContinue, loading = false }: Props = $props();

  let saved = $state(false);

  const actions = $derived<OnboardingStepAction[]>([
    {
      label: "Continue",
      onClick: onContinue,
      disabled: !saved,
      loading,
    },
  ]);
</script>

<OnboardingStepLayout
  title="Save your recovery key"
  description="You'll need this key to restore your encrypted backups. Save it somewhere safe before continuing. FUTO cannot recover this key if it is lost."
  {actions}
>
  <Stack gap={4}>
    <RecoveryKeyDisplay {code} />

    <HStack gap={3} class="items-center">
      <Checkbox bind:checked={saved} id="recovery-key-saved" />
      <Text size="small">
        <label for="recovery-key-saved">
          I saved my recovery key somewhere safe.
        </label>
      </Text>
    </HStack>
  </Stack>
</OnboardingStepLayout>
