<script lang="ts">
  import Accordion from "$lib/components/ui/Accordion.svelte";
  import {
    defaultQuietHoursEnd,
    defaultQuietHoursStart,
    toBandwidthDto,
    toBandwidthForm,
    toBytesPerSec,
    useConfig,
    useUpdateConfig,
  } from "$lib/services/config.service";
  import {
    Button,
    Field,
    HStack,
    LoadingSpinner,
    NumberInput,
    Select,
    Stack,
    Switch,
    Text,
  } from "@immich/ui";
  import { mdiSpeedometerSlow } from "@mdi/js";

  const hours = Array.from({ length: 24 }, (_, hour) => ({
    value: `${String(hour).padStart(2, "0")}:00`,
    label: `${String(hour).padStart(2, "0")}:00`,
  }));

  const config = useConfig();
  const mutation = useUpdateConfig();

  let mbps = $state<number>();
  let quiet = $state(false);
  let quietStart = $state(defaultQuietHoursStart);
  let quietEnd = $state(defaultQuietHoursEnd);
  let loaded = false;

  const load = () => {
    if (!config.data) {
      return;
    }

    ({ mbps, quiet, quietStart, quietEnd } = toBandwidthForm(
      config.data.bandwidth,
    ));
  };

  $effect(() => {
    if (loaded || !config.data) {
      return;
    }

    loaded = true;
    load();
  });

  const limited = $derived(toBytesPerSec(mbps) > 0);

  const onSave = () => {
    mutation.mutate({
      bandwidth: toBandwidthDto({ mbps, quiet, quietStart, quietEnd }),
    });
  };
</script>

<Accordion
  title="Bandwidth"
  subtitle="Manage how fast backups upload."
  icon={mdiSpeedometerSlow}
>
  <Stack gap={4} class="pt-2">
    {#if config.isLoading}
      <LoadingSpinner />
    {:else}
      <Field
        label="Upload speed"
        description="Slow down backup uploads without affecting restores. Leave empty for no limit."
        color="primary"
      >
        <NumberInput
          bind:value={mbps}
          min={0}
          step={1}
          placeholder="No limit"
          trailingText="Mbps"
        />
      </Field>

      <Field
        label="Full speed during quiet hours"
        description="Lift the limit while you are asleep."
        color="primary"
        disabled={!limited}
      >
        <Switch bind:checked={quiet} />
      </Field>

      {#if limited && quiet}
        <HStack gap={4}>
          <Field label="From" color="primary">
            <Select
              options={hours}
              value={quietStart}
              onChange={(value) => (quietStart = value)}
            />
          </Field>
          <Field label="Until" color="primary">
            <Select
              options={hours}
              value={quietEnd}
              onChange={(value) => (quietEnd = value)}
            />
          </Field>
        </HStack>

        {#if quietStart === quietEnd}
          <Text size="small" color="muted">
            With the same start and end time, the limit never applies.
          </Text>
        {/if}
      {/if}

      <HStack gap={2} class="justify-end">
        <Button
          shape="round"
          color="secondary"
          disabled={mutation.isPending}
          onclick={load}
        >
          Reset
        </Button>
        <Button shape="round" loading={mutation.isPending} onclick={onSave}>
          Save
        </Button>
      </HStack>
    {/if}
  </Stack>
</Accordion>
