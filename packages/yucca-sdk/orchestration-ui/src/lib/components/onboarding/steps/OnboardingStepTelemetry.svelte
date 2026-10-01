<script lang="ts">
  import { useEnableTelemetry } from "$lib/services/onboarding.service";
  import { HStack, Icon, Stack, Text } from "@immich/ui";
  import { mdiChartBox, mdiEyeOff } from "@mdi/js";
  import { t } from "svelte-i18n-lingui";
  import OnboardingStepLayout, {
    type OnboardingStepAction,
  } from "./OnboardingStepLayout.svelte";

  type Props = {
    onContinue: () => void;
    onCancel: () => void;
  };

  const { onContinue, onCancel }: Props = $props();

  const mutation = useEnableTelemetry();

  const actions = $derived<OnboardingStepAction[]>([
    {
      label: $t`Continue`,
      onClick: () => mutation.mutate(undefined, { onSuccess: onContinue }),
      loading: mutation.isPending,
    },
    { label: $t`Cancel`, onClick: onCancel },
  ]);
</script>

<OnboardingStepLayout {actions} badge={false}>
  <Stack>
    <HStack>
      <Icon icon={mdiChartBox} class="shrink-0 place-self-start mt-1" />
      <Text>
        {$t`We collect usage and diagnostic data to understand how FUTO Backups is used and to find problems.`}</Text
      >
    </HStack>
    <HStack>
      <Icon icon={mdiEyeOff} class="shrink-0 place-self-start mt-1" />
      <Text>
        {$t`Your photos, files, and recovery key are never collected and never leave your device unencrypted.`}</Text
      >
    </HStack>
  </Stack>
</OnboardingStepLayout>
