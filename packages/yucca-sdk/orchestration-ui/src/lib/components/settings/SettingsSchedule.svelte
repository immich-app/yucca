<script lang="ts">
  import Accordion from "$lib/components/ui/Accordion.svelte";
  import { Button, Field, HStack, Select, Stack, Switch } from "@immich/ui";
  import { mdiClockOutline } from "@mdi/js";

  let enabled = $state(true);
  let frequency = $state("daily");
  let startTime = $state("0");

  const frequencies = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  const startTimes = Array.from({ length: 24 }, (_, hour) => ({
    value: String(hour),
    label: `${hour}:00`,
  }));

  type Props = {
    onSave: () => void;
    onReset: () => void;
  };

  const { onSave, onReset }: Props = $props();
</script>

<Accordion
  title="Schedule"
  subtitle="Manage when backups run."
  icon={mdiClockOutline}
>
  <Stack gap={4} class="pt-2">
    <Field
      label="Run backups automatically"
      description="Back up your library on a recurring schedule."
      color="primary"
    >
      <Switch bind:checked={enabled} />
    </Field>

    <Field
      label="Frequency"
      description="How often backups should run."
      color="primary"
      required="indicator"
      disabled={!enabled}
    >
      <Select options={frequencies} bind:value={frequency} />
    </Field>

    <Field
      label="Start time"
      description="When the scheduled backup starts."
      color="primary"
      required="indicator"
      disabled={!enabled}
    >
      <Select options={startTimes} bind:value={startTime} />
    </Field>

    <HStack gap={2} class="justify-end">
      <Button shape="round" color="secondary" onclick={onReset}>
        Reset
      </Button>
      <Button shape="round" onclick={onSave}>Save</Button>
    </HStack>
  </Stack>
</Accordion>
