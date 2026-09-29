<script lang="ts">
  import { HStack, Icon, Stack, Text } from "@immich/ui";
  import { mdiClock, mdiDownloadBox, mdiImageMultiple } from "@mdi/js";
  import OnboardingStepLayout, {
    type OnboardingStepAction,
  } from "./OnboardingStepLayout.svelte";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    schedule: string;
    storageLocation: string;
    onStartBackup: () => void;
    loading?: boolean;
  };

  const {
    schedule,
    storageLocation,
    onStartBackup,
    loading = false,
  }: Props = $props();

  const settings = $derived([
    {
      icon: mdiImageMultiple,
      title: $t`Backup contents`,
      value: $t`Photos, videos, metadata, database, configuration, and external libraries.`,
    },
    {
      icon: mdiClock,
      title: $t`Schedule`,
      value: schedule,
    },
    {
      icon: mdiDownloadBox,
      title: $t`Storage location`,
      value: storageLocation,
    },
  ]);

  const actions = $derived<OnboardingStepAction[]>([
    { label: $t`Start backup`, onClick: onStartBackup, loading },
  ]);
</script>

<OnboardingStepLayout
  title={$t`Start your first backup`}
  description={$t`Immich has prepared recommended settings for your first backup. You can update these anytime from the Backups dashboard.`}
  {actions}
>
  <Stack gap={4}>
    {#each settings as setting (setting.title)}
      <HStack gap={4}>
        <Icon
          icon={setting.icon}
          size="2.4rem"
          class="text-primary mt-1 shrink-0"
        />

        <Stack>
          <Text fontWeight="semi-bold" size="small">{setting.title}</Text>
          <Text size="small" color="muted">{setting.value}</Text>
        </Stack>
      </HStack>
    {/each}
  </Stack>
</OnboardingStepLayout>
