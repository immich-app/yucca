<script lang="ts">
  import { HStack, Icon, Stack, Text } from "@immich/ui";
  import {
    mdiAccountMultipleOutline,
    mdiChartBoxOutline,
    mdiCogOutline,
    mdiFormatListBulletedType,
  } from "@mdi/js";
  import type { Snippet } from "svelte";

  type Props = {
    children: Snippet;
    settingsActive?: boolean;
  };

  const { children, settingsActive = true }: Props = $props();

  const entries: [string, string][] = [
    ["Users", mdiAccountMultipleOutline],
    ["Job Queues", mdiFormatListBulletedType],
    ["Server Stats", mdiChartBoxOutline],
  ];
</script>

<Stack gap={2} class="bg-light w-72 shrink-0 rounded-2xl border p-4">
  {@render children()}

  {#each entries as [title, icon] (title)}
    <HStack gap={4} class="rounded-full px-4 py-2.5">
      <Icon {icon} size="1.5em" />
      <Text>{title}</Text>
    </HStack>
  {/each}

  <HStack
    gap={4}
    class="rounded-full px-4 py-2.5 {settingsActive ? 'bg-primary/10' : ''}"
  >
    <Icon
      icon={mdiCogOutline}
      size="1.5em"
      class={settingsActive ? "text-primary" : ""}
    />
    <Text color={settingsActive ? "primary" : undefined}>Settings</Text>
  </HStack>
</Stack>
