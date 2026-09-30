<script lang="ts">
  import BackendsList from "$lib/components/backends/BackendsList.svelte";
  import Accordion from "$lib/components/ui/Accordion.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import type { RetentionPolicyDto } from "$lib/fetch-client";
  import {
    useConfigureImmichIntegration,
    useIntegrationEventHandler,
    useIntegrations,
  } from "$lib/services/integrations.service";
  import {
  handleDisableWormRepository,
    useRepositories,
    useRepositoryEventHandler,
  } from "$lib/services/repository.service";
  import {
    useScheduleEventHandler,
    useSchedules,
  } from "$lib/services/schedule.service";
  import {
    Button,
    Field,
    HelperText,
    HStack,
    Input,
    LoadingSpinner,
    Select,
    Stack,
    Switch,
  } from "@immich/ui";
  import { mdiDownloadBox } from "@mdi/js";
  import { msg, t } from "svelte-i18n-lingui";

  type RetentionChoice = {
    key: string;
    label: string;
    policy: RetentionPolicyDto | null;
  };

  const retentionChoices: RetentionChoice[] = [
    { key: "15d", label: msg`After 15 days`, policy: { keepWithin: "15d" } },
    { key: "30d", label: msg`After 30 days`, policy: { keepWithin: "30d" } },
    { key: "60d", label: msg`After 60 days`, policy: { keepWithin: "60d" } },
    { key: "90d", label: msg`After 90 days`, policy: { keepWithin: "90d" } },
    { key: "2", label: msg`Keep latest two backups`, policy: { keepLast: 2 } },
    { key: "never", label: msg`Never (keep all backups)`, policy: null },
  ];

  const defaultRetentionKey = "60d";

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

  let name = $state("");
  let worm = $state(false);
  let retentionKey = $state(defaultRetentionKey);
  let loaded = false;

  const nameMissing = $derived(name.trim().length === 0);

  const load = () => {
    if (!repository) {
      return;
    }

    name = repository.name;

    const policy = repository.configuration?.retentionPolicy ?? null;
    retentionKey =
      retentionChoices.find(
        (choice) => JSON.stringify(choice.policy) === JSON.stringify(policy),
      )?.key ?? defaultRetentionKey;
  };

  $effect(() => {
    if (loaded || !repository) {
      return;
    }

    loaded = true;
    load();
  });

  const onSave = () => {
    if (!integration || !repository || !schedule) {
      return;
    }

    mutation.mutate({
      name,
      cron: schedule.cron,
      dataFolders: integration.configuration.dataFolders,
      backupConfiguration: integration.configuration.backupConfiguration,
      libraries: integration.configuration.libraries,
      worm,
      retentionPolicy: worm
        ? null
        : (retentionChoices.find((choice) => choice.key === retentionKey)
            ?.policy ?? null),
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
  title={$t`Storage`}
  subtitle={$t`Manage the backup name, where it is stored, and how long backups are kept.`}
  icon={mdiDownloadBox}
>
  <Stack gap={4} class="pt-2">
    {#if isLoading}
      <LoadingSpinner />
    {:else}
      <Field
        label={$t`Backup name`}
        description={$t`How this backup is labelled across FUTO Backups.`}
        required="indicator"
        invalid={nameMissing}
      >
        <Input bind:value={name} />
        {#if nameMissing}
          <HelperText color="danger">{$t`Enter a backup name.`}</HelperText>
        {/if}
      </Field>

      <BackendsList {repository} />

      {#if repository?.worm}
        <Button onclick={() => handleDisableWormRepository(repository.id, true)}>
          {$t`Disable write-only`}
        </Button>
      {:else}
        <Field
          label={$t`Write-only`}
          description={$t`Once written, backups can't be removed.`}
        >
          <Switch bind:checked={worm} />
        </Field>
      {/if}

      <Field
        label={$t`Delete old backups`}
        description={$t`Older snapshots are pruned automatically.`}
        disabled={worm}
      >
        <Select
          options={retentionChoices.map(({ key, label }) => ({
            value: key,
            label: $t(label),
          }))}
          value={worm ? "never" : retentionKey}
          onChange={(value) => (retentionKey = value)}
        />
      </Field>

      <HStack gap={2} class="justify-end">
        <Button
          shape="round"
          color="secondary"
          disabled={mutation.isPending}
          onclick={load}
        >
          {$t`Reset`}
        </Button>
        <Button
          shape="round"
          disabled={nameMissing}
          loading={mutation.isPending}
          onclick={onSave}
        >
          {$t`Save`}
        </Button>
      </HStack>
    {/if}
  </Stack>
</Accordion>
