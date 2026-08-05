<script lang="ts">
  import Accordion from "$lib/components/ui/Accordion.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import {
    useConfigureImmichIntegration,
    useIntegrationEventHandler,
    useIntegrations,
  } from "$lib/services/integrations.service";
  import {
    useRepositories,
    useRepositoryEventHandler,
  } from "$lib/services/repository.service";
  import {
    handlePauseSchedule,
    handleResumeSchedule,
    useScheduleEventHandler,
    useSchedules,
  } from "$lib/services/schedule.service";
  import {
    Button,
    Field,
    HStack,
    LoadingSpinner,
    Select,
    Stack,
    Switch,
    Text,
  } from "@immich/ui";
  import { mdiClockOutline } from "@mdi/js";
  import cronstrue from "cronstrue";

  type Frequency = "daily" | "weekly" | "monthly";

  const frequencies = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
  ];

  const startTimes = Array.from({ length: 24 }, (_, hour) => ({
    value: String(hour),
    label: `${String(hour).padStart(2, "0")}:00`,
  }));

  const integrations = useIntegrations();
  const repositories = useRepositories();
  const schedules = useSchedules();
  const mutation = useConfigureImmichIntegration();

  const { onIntegrationUpdate } = useIntegrationEventHandler();
  const { onRepositoryCreate, onRepositoryUpdate, onRepositoryDelete } =
    useRepositoryEventHandler();
  const { onScheduleCreate, onScheduleUpdate, onScheduleDelete } =
    useScheduleEventHandler();

  const integration = $derived(integrations.data?.immichIntegration);

  const repository = $derived(
    integration
      ? repositories.data?.find((entry) => entry.id === integration.id)
      : undefined,
  );

  const schedule = $derived(
    integration
      ? schedules.data?.find((entry) => entry.id === integration.scheduleId)
      : undefined,
  );

  const isLoading = $derived(
    integrations.isLoading || repositories.isLoading || schedules.isLoading,
  );

  let frequency = $state<Frequency>("daily");
  let startTime = $state("3");
  let loaded = false;

  const parse = (cron: string) => {
    // notes
    // cron rewritten on write
    // - minute discarded
    // - weekly/monthly forced to set date
    //   => need server-determined date for load distribution
    const [minute, hour, day, , weekday] = cron.split(" ");

    return {
      hour: /^\d+$/.test(hour ?? "") ? hour : "3",
      minute: /^\d+$/.test(minute ?? "") ? Number(minute) : 0,
      frequency: (day !== "*"
        ? "monthly"
        : weekday !== "*"
          ? "weekly"
          : "daily") as Frequency,
    };
  };

  const load = () => {
    if (!schedule) {
      return;
    }

    const parsed = parse(schedule.cron);
    frequency = parsed.frequency;
    startTime = parsed.hour;
  };

  $effect(() => {
    if (loaded || !schedule) {
      return;
    }

    loaded = true;
    load();
  });

  const cron = $derived.by(() => {
    const hour = Number(startTime);

    switch (frequency) {
      case "weekly": {
        return `0 ${hour} * * 0`;
      }
      case "monthly": {
        return `0 ${hour} 1 * *`;
      }
      default: {
        return `0 ${hour} * * *`;
      }
    }
  });

  const enabled = $derived(!schedule?.paused);

  const onToggle = (value: boolean) => {
    if (!schedule) {
      return;
    }

    if (value) {
      handleResumeSchedule(schedule.id, "Immich");
    } else {
      handlePauseSchedule(schedule.id, "Immich");
    }
  };

  const onSave = () => {
    if (!integration || !repository || !schedule) {
      return;
    }

    mutation.mutate({
      name: repository.name,
      worm: repository.worm,
      dataFolders: integration.configuration.dataFolders,
      backupConfiguration: integration.configuration.backupConfiguration,
      libraries: integration.configuration.libraries,
      retentionPolicy: repository.configuration?.retentionPolicy ?? null,
      cron,
    });
  };
</script>

<OnEvents
  {onIntegrationUpdate}
  {onRepositoryCreate}
  {onRepositoryUpdate}
  {onRepositoryDelete}
  {onScheduleCreate}
  {onScheduleUpdate}
  {onScheduleDelete}
/>

<Accordion
  title="Schedule"
  subtitle="Manage when backups run."
  icon={mdiClockOutline}
>
  <Stack gap={4} class="pt-2">
    {#if isLoading}
      <LoadingSpinner />
    {:else}
      <Field
        label="Run backups automatically"
        description="Back up your library on a recurring schedule."
        color="primary"
      >
        <Switch checked={enabled} onCheckedChange={onToggle} />
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

      <Text size="small" color="muted">
        Backups will run <span class="lowercase"
          >{cronstrue.toString(cron, { verbose: true })}</span
        >.
      </Text>

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
