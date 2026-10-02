<script lang="ts">
  import { HStack, Icon, Stack, Text } from "@immich/ui";
  import {
    mdiHistory,
    mdiImageRefreshOutline,
    mdiLayersTripleOutline,
    mdiShieldKey,
  } from "@mdi/js";
  import { t } from "svelte-i18n-lingui";

  const features = $derived([
    {
      icon: mdiLayersTripleOutline,
      title: $t`Built for Immich`,
      description: $t`Backup your photos, videos, albums, metadata, database, configuration, and external libraries together.`,
    },
    {
      icon: mdiShieldKey,
      title: $t`Encrypted by design`,
      description: $t`Your backups stay encrypted and can only be restored with your recovery key.`,
    },
    {
      icon: mdiImageRefreshOutline,
      title: $t`Restore in one click`,
      description: $t`Restore your files from an earlier backup whenever you want to return to a previous version.`,
    },
    {
      icon: mdiHistory,
      title: $t`Automatic backups`,
      description: $t`Your library is backed up in the background without managing a separate backup tool.`,
    },
  ]);
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
