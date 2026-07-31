<script lang="ts">
  import { HStack, Icon, Stack, Text } from "@immich/ui";
  import { mdiClock, mdiDownloadBox, mdiImageMultiple } from "@mdi/js";
  import OnboardingStepLayout from "./OnboardingStepLayout.svelte";

  type Props = {
    schedule: string;
    storageLocation: string;
    onStartBackup: () => void;
  };

  const { schedule, storageLocation, onStartBackup }: Props = $props();

  const settings = $derived([
    {
      icon: mdiImageMultiple,
      title: "Backup contents",
      value:
        "Photos, videos, metadata, database, configuration, and external libraries.",
    },
    {
      icon: mdiClock,
      title: "Schedule",
      value: schedule,
    },
    {
      icon: mdiDownloadBox,
      title: "Storage location",
      value: storageLocation,
    },
  ]);
</script>

<OnboardingStepLayout
  title="Start your first backup"
  description="Immich has prepared recommended settings for your first backup. You can update these anytime from the Backups dashboard."
  actionLabel="Start backup"
  onAction={onStartBackup}
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
