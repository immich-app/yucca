<script lang="ts">
  import Accordion from "$lib/components/ui/Accordion.svelte";
  import { Button, Field, HStack, Stack, Switch } from "@immich/ui";
  import { mdiImageMultiple } from "@mdi/js";

  const contents = $state([
    {
      label: "Photos and videos",
      description: "Back up original media files in your library.",
      checked: true,
    },
    {
      label: "Metadata",
      description:
        "Back up albums, people, tags, favorites, and other library details.",
      checked: true,
    },
    {
      label: "Database and configuration",
      description: "Back up your Immich database and server configuration.",
      checked: true,
    },
    {
      label: "External libraries",
      description: "Include files from configured external libraries.",
      checked: true,
    },
  ]);

  type Props = {
    onSave: () => void;
  };

  const { onSave }: Props = $props();
</script>

<Accordion
  title="Backup Contents"
  subtitle="Choose what Immich includes in each backup."
  icon={mdiImageMultiple}
>
  <Stack gap={4} class="pt-2">
    {#each contents as item (item.label)}
      <Field label={item.label} description={item.description}>
        <Switch bind:checked={item.checked} />
      </Field>
    {/each}

    <HStack class="justify-end">
      <Button shape="round" onclick={onSave}>Save</Button>
    </HStack>
  </Stack>
</Accordion>
