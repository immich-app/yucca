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
    useScheduleEventHandler,
    useSchedules,
  } from "$lib/services/schedule.service";
  import {
    Button,
    Checkbox,
    Field,
    HStack,
    LoadingSpinner,
    Select,
    Stack,
    Switch,
    Text,
  } from "@immich/ui";
  import { mdiImageMultiple } from "@mdi/js";
  import { SvelteSet } from "svelte/reactivity";

  type Group = {
    key: string;
    label: string;
    description: string;
    folders: string[];
    required?: boolean;
    warning?: string;
    warningColor?: "danger" | "warning";
  };

  const groups: Group[] = [
    {
      key: "media",
      label: "Photos and videos",
      description: "Your media uploaded directly to Immich.",
      folders: ["upload", "profile", "library"],
      warning: "It is highly recommended you back this up!",
      warningColor: "danger",
    },
    {
      key: "database",
      label: "Database and metadata",
      description:
        "Albums, people, tags, favorites and other library details. Required to restore.",
      folders: ["backups"],
      required: true,
    },
    {
      key: "thumbs",
      label: "Thumbnails and previews",
      description: "Generated photo previews, can be recreated later.",
      folders: ["thumbs"],
      warning:
        "When restoring, you will see broken previews. Use the admin panel to regenerate them.",
      warningColor: "warning",
    },
    {
      key: "encoded",
      label: "Encoded videos",
      description: "Generated video previews, can be recreated later.",
      folders: ["encoded-video"],
      warning:
        "When restoring, you will see broken previews. Use the admin panel to regenerate them.",
      warningColor: "warning",
    },
  ];

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

  type LibrariesMode = "all" | "none" | "some";

  const libraryModes = [
    { value: "all", label: "All libraries" },
    { value: "none", label: "No libraries" },
    { value: "some", label: "Choose libraries" },
  ];

  const folders = new SvelteSet<string>();
  const selectedLibraries = new SvelteSet<string>();
  let backupConfiguration = $state(true);
  let librariesMode = $state<LibrariesMode>("all");
  let loaded = false;

  $effect(() => {
    if (loaded || !integration) {
      return;
    }

    loaded = true;
    backupConfiguration = integration.configuration.backupConfiguration;

    const libraries = integration.configuration.libraries;

    if (libraries === "all") {
      librariesMode = "all";
    } else if (libraries.length === 0) {
      librariesMode = "none";
    } else {
      librariesMode = "some";

      for (const id of libraries) {
        selectedLibraries.add(id);
      }
    }

    for (const folder of integration.configuration.dataFolders) {
      folders.add(folder);
    }
  });

  const toggleLibrary = (id: string) => {
    if (selectedLibraries.has(id)) {
      selectedLibraries.delete(id);
    } else {
      selectedLibraries.add(id);
    }
  };

  const available = $derived(
    integrations.data?.immichState?.dataFolders ?? [],
  );

  const libraries = $derived(integrations.data?.immichState?.libraries ?? []);

  const applicable = (group: Group) =>
    group.folders.filter((folder) => available.includes(folder));

  const isChecked = (group: Group) => {
    const own = applicable(group);

    return own.length > 0 && own.every((folder) => folders.has(folder));
  };

  const toggle = (group: Group) => {
    const own = applicable(group);
    const enabled = own.every((folder) => folders.has(folder));

    for (const folder of own) {
      if (enabled) {
        folders.delete(folder);
      } else {
        folders.add(folder);
      }
    }
  };

  const onSave = () => {
    folders.add("backups");

    if (!integration || !repository || !schedule) {
      return;
    }

    mutation.mutate({
      name: repository.name,
      worm: repository.worm,
      cron: schedule.cron,
      retentionPolicy: repository.configuration?.retentionPolicy ?? null,
      dataFolders: [...folders],
      backupConfiguration,
      libraries:
        librariesMode === "all"
          ? "all"
          : librariesMode === "none"
            ? []
            : [...selectedLibraries],
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
  title="Backup Contents"
  subtitle="Choose what Immich includes in each backup."
  icon={mdiImageMultiple}
>
  <Stack gap={4} class="pt-2">
    {#if isLoading}
      <LoadingSpinner />
    {:else}
      {#each groups as group (group.key)}
        {#if applicable(group).length > 0}
          <Stack gap={1}>
            <Field
              label={group.label}
              description={group.description}
              readOnly={group.required}
              required={group.required ? "indicator" : undefined}
            >
              <Switch
                checked={group.required || isChecked(group)}
                class={group.required
                  ? "cursor-not-allowed opacity-38"
                  : undefined}
                onCheckedChange={() => toggle(group)}
              />
            </Field>

            {#if group.warning && !group.required && !isChecked(group)}
              <Text size="small" color={group.warningColor}>
                {group.warning}
              </Text>
            {/if}
          </Stack>
        {/if}
      {/each}

      <Stack gap={1}>
        <Field
          label="Backup configuration"
          description="Include these backup settings, so they survive a restore."
        >
          <Switch bind:checked={backupConfiguration} />
        </Field>

        {#if !backupConfiguration}
          <Text size="small" color="warning">
            You will need to reconfigure backups from scratch after restoring.
          </Text>
        {/if}
      </Stack>

      <Field
        label="External libraries"
        description="Libraries stored outside of Immich. New libraries are included automatically unless you choose specific ones."
      >
        <Select
          options={libraryModes}
          value={librariesMode}
          onChange={(value) => (librariesMode = value as LibrariesMode)}
        />
      </Field>

      {#if librariesMode === "some"}
        {#if libraries.length === 0}
          <Text size="small" color="muted">No external libraries found.</Text>
        {:else}
          <Stack gap={2} class="ps-1">
            {#each libraries as library (library.id)}
              <label class="flex select-none items-center gap-3">
                <Checkbox
                  checked={selectedLibraries.has(library.id)}
                  onCheckedChange={() => toggleLibrary(library.id)}
                />
                <Text size="small">{library.name}</Text>
              </label>
            {/each}
          </Stack>
        {/if}
      {:else if librariesMode === "all" && libraries.length > 0}
        <Text size="small" color="muted">
          Included: {libraries.map((library) => library.name).join(", ")}
        </Text>
      {/if}

      <HStack class="justify-end">
        <Button
          shape="round"
          loading={mutation.isPending}
          onclick={onSave}
        >
          Save
        </Button>
      </HStack>
    {/if}
  </Stack>
</Accordion>
