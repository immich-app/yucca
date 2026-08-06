<script lang="ts">
  import { HStack, Icon, Stack, Text } from "@immich/ui";
  import {
    mdiHistory,
    mdiImageRefreshOutline,
    mdiLayersTripleOutline,
    mdiShieldKey,
  } from "@mdi/js";

  const features = [
    {
      icon: mdiLayersTripleOutline,
      title: "Built for Immich",
      description:
        "Backup your photos, videos, albums, metadata, database, configuration, and external libraries together.",
    },
    {
      icon: mdiShieldKey,
      title: "Encrypted by design",
      description:
        "Your backups are protected with E2EE encryption, so only your recovery key can restore them.",
    },
    {
      icon: mdiImageRefreshOutline,
      title: "Snapshot restore",
      description:
        "Restore your photos, videos, metadata, database, and configuration from a backup snapshot.",
    },
    {
      icon: mdiHistory,
      title: "Automatic backups",
      description:
        "Your library is backed up in the background without managing a separate backup tool.",
    },
  ];
</script>

<div class="grid gap-x-12 gap-y-8 sm:grid-cols-2">
  {#each features as feature (feature.title)}
    <HStack gap={4} class="items-start">
      <Icon
        icon={feature.icon}
        size="3rem"
        class="text-primary mt-1 shrink-0"
      />
      <Stack gap={1}>
        <Text fontWeight="semi-bold">{feature.title}</Text>
        <Text size="small" color="muted">{feature.description}</Text>
      </Stack>
    </HStack>
  {/each}
</div>
