<script lang="ts">
  import {
    Alert,
    Checkbox,
    Field,
    FormModal,
    Input,
    LoadingSpinner,
    Stack,
    Text,
  } from "@immich/ui";
  import validate from "cron-validate";
  import { sdk } from "$lib";
  import { SvelteSet } from "svelte/reactivity";
  import { useIntegrations } from "$lib/services/integrations.service";
  import { useSchedules } from "$lib/services/schedule.service";
  import { getReadableErrorMessage } from "$lib/utils/handle-error";

  interface Props {
    onClose: () => void;
    initialConfiguration?: boolean;
  }

  let { initialConfiguration = false, onClose }: Props = $props();

  let name = $state("Immich");
  let cron = $state("0 3 * * *");
  let worm = $state(false);

  let includeYuccaConfig = $state(true);
  let allLibraries = $state(true);
  let selectedFolders = new SvelteSet<string>();
  let selectedLibraries = new SvelteSet<string>();

  const folderLabels: Record<string, string> = {
    "encoded-video": "Encoded Video",
    library: "Library",
    upload: "Uploads",
    profile: "Profile Pictures",
    thumbs: "Thumbnails",
    backups: "Database Backups",
  };

  const query = useIntegrations();
  const schedulesQuery = useSchedules();

  let populated = false;

  $effect(() => {
    if (populated || !query.data?.immichState) return;
    populated = true;

    const integration = query.data.immichIntegration;
    if (integration) {
      const config = integration.configuration;
      includeYuccaConfig = config.backupConfiguration;
      allLibraries = config.libraries === "all";

      for (const folder of config.dataFolders) {
        selectedFolders.add(folder);
      }

      if (Array.isArray(config.libraries)) {
        for (const id of config.libraries) {
          selectedLibraries.add(id);
        }
      }

      const schedule = schedulesQuery.data?.find(
        (schedule) => schedule.id === integration.scheduleId,
      );

      if (schedule) {
        cron = schedule.cron;
      }
    } else {
      for (const folder of query.data.immichState.dataFolders) {
        selectedFolders.add(folder);
      }
    }
  });

  function toggleFolder(folder: string) {
    if (selectedFolders.has(folder)) {
      selectedFolders.delete(folder);
    } else {
      selectedFolders.add(folder);
    }
  }

  function toggleLibrary(id: string) {
    if (selectedLibraries.has(id)) {
      selectedLibraries.delete(id);
    } else {
      selectedLibraries.add(id);
    }
  }

  const onSubmit = async () => {
    await sdk.configureImmichIntegration({
      name,
      cron,
      worm,
      dataFolders: [...selectedFolders],
      backupConfiguration: includeYuccaConfig,
      libraries: allLibraries ? "all" : [...selectedLibraries],
    });

    onClose();
  };
</script>

<FormModal
  title="Configure Your Immich Backup"
  disabled={name.length === 0 || validate(cron).isError()}
  {onClose}
  {onSubmit}
>
  <Stack gap={4}>
    <Field label="Name" description="A memorable name for this backup">
      <Input bind:value={name} />
    </Field>
    <Field label="Schedule" description="Uses cron syntax">
      <Input bind:value={cron} />
    </Field>

    {#if initialConfiguration}
      <Field
        label="Write once (WORM)"
        description="Prevent anything being deleted"
      >
        <Checkbox bind:checked={worm} />
      </Field>
    {/if}

    {#if query.isLoading}
      <LoadingSpinner />
    {:else if query.isError}
      <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
    {:else if query.isSuccess && query.data.immichState}
      {@const immich = query.data.immichState}

      <Stack gap={2}>
        <div>
          <Text fontWeight="bold">Data Folders</Text>
          <Text size="small" color="secondary"
            >Select which Immich data to include in backups</Text
          >
        </div>
        {#each immich.dataFolders as folder}
          <label class="select-none flex gap-2 items-center">
            <Checkbox
              checked={selectedFolders.has(folder)}
              onCheckedChange={() => toggleFolder(folder)}
            />
            {folderLabels[folder] ?? folder}
          </label>
        {/each}
      </Stack>

      <Stack gap={2}>
        <div>
          <Text fontWeight="bold">Backup Configuration</Text>
          <Text size="small" color="secondary"
            >Include your backup settings & schedules</Text
          >
        </div>
        <label class="select-none flex gap-2 items-center">
          <Checkbox bind:checked={includeYuccaConfig} />
          Include yucca configuration
        </label>
      </Stack>

      <Stack gap={2}>
        <div>
          <Text fontWeight="bold">External Libraries</Text>
          <Text size="small" color="secondary"
            >Choose which external libraries to back up</Text
          >
        </div>
        <label class="select-none flex gap-2 items-center">
          <Checkbox
            bind:checked={allLibraries}
            onCheckedChange={() => selectedLibraries.clear()}
          />
          All libraries (existing and future)
        </label>

        {#if !allLibraries}
          {#each immich.libraries as library}
            <label class="select-none flex gap-2 items-center pl-4">
              <Checkbox
                checked={selectedLibraries.has(library.id)}
                onCheckedChange={() => toggleLibrary(library.id)}
              />
              {library.name}
            </label>
          {/each}
          {#if immich.libraries.length === 0}
            <Text size="small" color="secondary"
              >No external libraries found.</Text
            >
          {/if}
        {/if}
      </Stack>
    {/if}
  </Stack>
</FormModal>
