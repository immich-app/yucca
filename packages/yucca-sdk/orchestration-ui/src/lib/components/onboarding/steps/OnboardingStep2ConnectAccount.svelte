<script lang="ts">
  import { HStack, Icon, Stack, Text } from "@immich/ui";
  import { mdiCheckCircle } from "@mdi/js";
  import OnboardingStepLayout, {
    type OnboardingStepAction,
  } from "./OnboardingStepLayout.svelte";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    onConnect: () => void;
    onLocalStorage?: () => void;
  };

  const { onConnect, onLocalStorage }: Props = $props();

  const outcomes = $derived([
    $t`Link this Immich server to your FUTO account`,
    $t`Set up FUTO Cloud as your backup storage`,
    $t`Return you here to finish setup`,
  ]);

  const actions = $derived<OnboardingStepAction[]>([
    { label: $t`Connect account`, onClick: () => onConnect() },
    {
      label: $t`Use local storage`,
      onClick: () => onLocalStorage?.(),
      $if: () => !!onLocalStorage,
    },
  ]);
</script>

<OnboardingStepLayout
  description={$t`Connect your FUTO account to use FUTO Cloud for backup storage.`}
  {actions}
  badge={false}
>
  <Stack gap={3}>
    <Text fontWeight="semi-bold" size="small">{$t`This will:`}</Text>

    {#each outcomes as outcome (outcome)}
      <HStack gap={3} class="items-center">
        <Icon
          icon={mdiCheckCircle}
          size="1.25rem"
          class="text-primary shrink-0"
        />
        <Text size="small">{outcome}</Text>
      </HStack>
    {/each}
  </Stack>
</OnboardingStepLayout>
