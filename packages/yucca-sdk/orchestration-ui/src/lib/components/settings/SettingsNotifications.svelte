<script lang="ts">
  import Accordion from "$lib/components/ui/Accordion.svelte";
  import { Button, Field, HStack, Stack, Switch } from "@immich/ui";
  import { mdiBellOutline } from "@mdi/js";
  import { msg, t } from "svelte-i18n-lingui";

  const alerts = $state([
    {
      label: msg`Backup failures`,
      description: msg`Notify me when a backup fails.`,
      checked: true,
    },
    {
      label: msg`Storage issues`,
      description: msg`Notify me when backup storage is unavailable or running low.`,
      checked: true,
    },
    {
      label: msg`Billing issues`,
      description: msg`Notify me when FUTO Backups billing needs attention.`,
      checked: true,
    },
  ]);

  type Props = {
    onSave: () => void;
  };

  const { onSave }: Props = $props();
</script>

<Accordion
  title={$t`Notifications`}
  subtitle={$t`Manage backup alerts.`}
  icon={mdiBellOutline}
>
  <Stack gap={4} class="pt-2">
    {#each alerts as alert (alert.label)}
      <Field label={$t(alert.label)} description={$t(alert.description)}>
        <Switch bind:checked={alert.checked} />
      </Field>
    {/each}

    <HStack class="justify-end">
      <Button shape="round" onclick={onSave}>{$t`Save`}</Button>
    </HStack>
  </Stack>
</Accordion>
