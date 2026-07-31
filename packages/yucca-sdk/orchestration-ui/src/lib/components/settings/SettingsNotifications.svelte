<script lang="ts">
  import Accordion from "$lib/components/ui/Accordion.svelte";
  import { Button, Field, HStack, Stack, Switch } from "@immich/ui";
  import { mdiBellOutline } from "@mdi/js";

  const alerts = $state([
    {
      label: "Backup failures",
      description: "Notify me when a backup fails.",
      checked: true,
    },
    {
      label: "Storage issues",
      description: "Notify me when backup storage is unavailable or running low.",
      checked: true,
    },
    {
      label: "Billing issues",
      description: "Notify me when FUTO Backups billing needs attention.",
      checked: true,
    },
  ]);

  type Props = {
    onSave: () => void;
  };

  const { onSave }: Props = $props();
</script>

<Accordion
  title="Notifications"
  subtitle="Manage backup alerts."
  icon={mdiBellOutline}
>
  <Stack gap={4} class="pt-2">
    {#each alerts as alert (alert.label)}
      <Field label={alert.label} description={alert.description}>
        <Switch bind:checked={alert.checked} />
      </Field>
    {/each}

    <HStack class="justify-end">
      <Button shape="round" onclick={onSave}>Save</Button>
    </HStack>
  </Stack>
</Accordion>
