<script lang="ts">
  import * as sdk from "$lib/fetch-client";
  import { useIntegrations } from "$lib/services/integrations.service";
  import { useSchedules } from "$lib/services/schedule.service";
  import { handleError } from "$lib/utils/handle-error";
  import {
    Alert,
    Button,
    Checkbox,
    Field,
    FormModal,
    Heading,
    HStack,
    Input,
    LoadingSpinner,
    Stack,
    Switch,
    Text,
  } from "@immich/ui";
  import { SvelteSet } from "svelte/reactivity";

  // TODO REFACTOR

  interface Props {
    onFinish?: () => void;
    onCancel?: () => void;
    onClose?: () => void;
    backendId?: string;
  }

  let { onFinish, onCancel, onClose }: Props = $props();

  const integrationsQuery = useIntegrations();
  const schedulesQuery = useSchedules();

  let name = $state("Immich");
  let worm = $state(false);
  let cron = $state("0 3 * * *");
  let backupConfiguration = $state(true);
  let librariesMode = $state<"all" | "none" | "some">("all");
  let scheduleMode = $state<"daily" | "custom">("daily");
  let scheduleHour = $state(3);
  let scheduleMinute = $state(0);

  const selectedFolders = new SvelteSet<string>();
  const selectedLibraries = new SvelteSet<string>();

  type FolderItem = { label: string; description?: string; folders: string[] };

  const FOLDER_ITEMS: FolderItem[] = [
    {
      label: "Photos and videos",
      description: "Your media uploaded directly to Immich.",
      folders: ["upload", "profile", "library"],
    },
    {
      label: "Database backups",
      description: "Albums, faces, and metadata. You'll need this to restore.",
      folders: ["backups"],
    },
    {
      label: "Thumbnails and previews",
      description: "Generated photo previews, can be recreated later.",
      folders: ["thumbs"],
    },
    {
      label: "Encoded videos",
      description: "Generated video previews, can be recreated later.",
      folders: ["encoded-video"],
    },
  ];

  let populated = false;

  $effect(() => {
    if (populated || !integrationsQuery.data?.immichState) {
      return;
    }
    populated = true;

    const integration = integrationsQuery.data.immichIntegration;
    if (integration) {
      const config = integration.configuration;
      backupConfiguration = config.backupConfiguration;

      if (config.libraries === "all") {
        librariesMode = "all";
      } else if (config.libraries.length === 0) {
        librariesMode = "none";
      } else {
        librariesMode = "some";
        for (const id of config.libraries) {
          selectedLibraries.add(id);
        }
      }

      for (const folder of config.dataFolders) {
        selectedFolders.add(folder);
      }

      const schedule = schedulesQuery.data?.find(
        (s) => s.id === integration.scheduleId,
      );
      if (schedule) {
        cron = schedule.cron;
        const parsed = parseDailyCron(cron);
        if (parsed) {
          scheduleMode = "daily";
          scheduleHour = parsed.hour;
          scheduleMinute = parsed.minute;
        } else {
          scheduleMode = "custom";
        }
      }
    } else {
      for (const folder of integrationsQuery.data.immichState.dataFolders) {
        selectedFolders.add(folder);
      }
    }
  });

  const effectiveCron = $derived(
    scheduleMode === "daily" ? `${scheduleMinute} ${scheduleHour} * * *` : cron,
  );

  const cronPreview = $derived(describeCron(effectiveCron));
  const cronValid = $derived(
    /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(effectiveCron.trim()),
  );

  const onSubmit = async () => {
    try {
      await sdk.configureImmichIntegration({
        name,
        worm,
        cron: effectiveCron,
        dataFolders: [...selectedFolders],
        backupConfiguration,
        libraries:
          librariesMode === "all"
            ? "all"
            : librariesMode === "none"
              ? []
              : [...selectedLibraries],
      });

      onFinish?.();
      onClose?.();
    } catch (error) {
      handleError(error, "Failed to save backup settings");
    }
  };

  function applicableFolders(item: FolderItem, available: string[]): string[] {
    return item.folders.filter((f) => available.includes(f));
  }

  function isItemChecked(item: FolderItem, available: string[]): boolean {
    const folders = applicableFolders(item, available);
    return folders.length > 0 && folders.every((f) => selectedFolders.has(f));
  }

  function toggleItem(item: FolderItem, available: string[]) {
    const folders = applicableFolders(item, available);
    const allOn = folders.every((f) => selectedFolders.has(f));
    for (const f of folders) {
      if (allOn) {
        selectedFolders.delete(f);
      } else {
        selectedFolders.add(f);
      }
    }
  }

  function toggleLibrary(id: string) {
    if (selectedLibraries.has(id)) {
      selectedLibraries.delete(id);
    } else {
      selectedLibraries.add(id);
    }
  }

  function parseDailyCron(
    expr: string,
  ): { hour: number; minute: number } | undefined {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) {
      return undefined;
    }
    const [min, hour, dom, mon, dow] = parts;
    if (dom !== "*" || mon !== "*" || dow !== "*") {
      return undefined;
    }
    if (!/^\d+$/.test(min) || !/^\d+$/.test(hour)) {
      return undefined;
    }
    return { hour: Number(hour), minute: Number(min) };
  }

  function describeCron(expr: string): string {
    const parsed = parseDailyCron(expr);
    if (!parsed) {
      return expr;
    }
    const ampm = parsed.hour >= 12 ? "PM" : "AM";
    const display = parsed.hour % 12 || 12;
    return `Daily at ${display}:${String(parsed.minute).padStart(2, "0")} ${ampm}`;
  }
</script>

<FormModal
  title="Backup settings"
  size="large"
  disabled={!cronValid || name.length === 0}
  onClose={() => {
    onCancel?.();
    onClose?.();
  }}
  {onSubmit}
>
  <Stack gap={6}>
    <Field label="Name">
      <Input bind:value={name} />
    </Field>

    {#if integrationsQuery.isLoading}
      <LoadingSpinner />
    {:else if integrationsQuery.isError}
      <Alert color="danger">Couldn't load Immich state.</Alert>
    {:else if integrationsQuery.data?.immichState}
      {@const immich = integrationsQuery.data.immichState}

      <Stack gap={2}>
        <Heading size="tiny" tag="h3">What to back up</Heading>
        {#each FOLDER_ITEMS.filter((i) => applicableFolders(i, immich.dataFolders).length > 0) as item (item.label)}
          <label class="flex select-none items-start gap-2">
            <Checkbox
              checked={isItemChecked(item, immich.dataFolders)}
              onCheckedChange={() => toggleItem(item, immich.dataFolders)}
              class="mt-0.5"
            />
            <div>
              <Text>{item.label}</Text>
              {#if item.description}
                <Text size="small" color="secondary">{item.description}</Text>
              {/if}
            </div>
          </label>
        {/each}
        <label class="flex select-none items-start gap-2">
          <Checkbox bind:checked={backupConfiguration} class="mt-0.5" />
          <div>
            <Text>Backup configuration</Text>
            <Text size="small" color="secondary">Saves these settings too.</Text
            >
          </div>
        </label>
      </Stack>

      <Stack gap={2}>
        <Stack gap={0}>
          <Heading size="tiny" tag="h3">External Libraries</Heading>
          <Text size="small" color="secondary"
            >By default, all existing and future external libraries will be
            backed up.</Text
          >
        </Stack>
        <HStack fullWidth>
          {#each [{ id: "all" as const, label: "All" }, { id: "none" as const, label: "None" }, { id: "some" as const, label: "Pick" }] as opt (opt.id)}
            <Button
              fullWidth
              size="small"
              variant={librariesMode === opt.id ? "filled" : "outline"}
              color={librariesMode === opt.id ? "primary" : "secondary"}
              onclick={() => (librariesMode = opt.id)}
            >
              {opt.label}
            </Button>
          {/each}
        </HStack>
        {#if librariesMode === "some"}
          {#if immich.libraries.length === 0}
            <Text size="small" color="secondary"
              >No external libraries found.</Text
            >
          {:else}
            <Stack gap={1}>
              {#each immich.libraries as library (library.id)}
                <label class="flex select-none items-center gap-2">
                  <Checkbox
                    checked={selectedLibraries.has(library.id)}
                    onCheckedChange={() => toggleLibrary(library.id)}
                  />
                  <Text>{library.name}</Text>
                </label>
              {/each}
            </Stack>
          {/if}
        {/if}
      </Stack>

      <Stack gap={2}>
        <Heading size="tiny" tag="h3">Schedule</Heading>

        <HStack fullWidth>
          <Button
            fullWidth
            size="small"
            variant={scheduleMode === "daily" ? "filled" : "outline"}
            color={scheduleMode === "daily" ? "primary" : "secondary"}
            onclick={() => (scheduleMode = "daily")}
          >
            Every day
          </Button>
          <Button
            fullWidth
            size="small"
            variant={scheduleMode === "custom" ? "filled" : "outline"}
            color={scheduleMode === "custom" ? "primary" : "secondary"}
            onclick={() => (scheduleMode = "custom")}
          >
            Custom (cron)
          </Button>
        </HStack>
        {#if scheduleMode === "daily"}
          <Field label="Time">
            <Input
              type="time"
              value={`${String(scheduleHour).padStart(2, "0")}:${String(scheduleMinute).padStart(2, "0")}`}
              oninput={(e) => {
                const [h, m] = (
                  e.currentTarget as HTMLInputElement
                ).value.split(":");
                scheduleHour = Number(h);
                scheduleMinute = Number(m);
              }}
            />
          </Field>
        {:else}
          <Field label="Cron expression">
            <Input bind:value={cron} placeholder="0 3 * * *" />
          </Field>
        {/if}
        <Text size="small" color="secondary">{cronPreview}</Text>
      </Stack>

      <Stack gap={2}>
        <Heading size="tiny" tag="h3">Advanced</Heading>
        <Field
          label="Write-only"
          description="Once written, files can't be removed."
        >
          <Switch bind:checked={worm} />
        </Field>
      </Stack>
    {/if}
  </Stack>
</FormModal>
