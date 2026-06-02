<script lang="ts">
  import Suspense from "$lib/components/util/Suspense.svelte";
  import * as sdk from "$lib/fetch-client";
  import {
    useConfigureImmichIntegration,
    useIntegrations,
  } from "$lib/services/integrations.service";
  import { useRepositories } from "$lib/services/repository.service";
  import { useSchedules } from "$lib/services/schedule.service";
  import {
    Button,
    Checkbox,
    Field,
    FormModal,
    Heading,
    HStack,
    Input,
    Select,
    Stack,
    Switch,
    Text,
  } from "@immich/ui";
  import validateCron from "cron-validate";
  import cronstrue from "cronstrue";
  import { SvelteSet } from "svelte/reactivity";

  type Props = {
    onFinish?: () => void;
    onCancel?: () => void;
    onClose?: () => void;
    backendId?: string;
  };

  let { onFinish, onCancel, onClose }: Props = $props();

  const query = useIntegrations();
  const schedulesQuery = useSchedules();
  const repositoriesQuery = useRepositories();

  type RetentionChoice = {
    key: string;
    label: string;
    policy: sdk.RetentionPolicyDto | null;
  };

  const retentionChoices: RetentionChoice[] = [
    { key: "15d", label: "After 15 days", policy: { keepWithin: "15d" } },
    { key: "30d", label: "After 30 days", policy: { keepWithin: "30d" } },
    { key: "60d", label: "After 60 days", policy: { keepWithin: "60d" } },
    { key: "90d", label: "After 90 days", policy: { keepWithin: "90d" } },
    { key: "2", label: "Keep latest two backups", policy: { keepLast: 2 } },
    { key: "never", label: "Never (keep all backups)", policy: null },
  ];
  const defaultRetentionKey = "60d";

  let name = $state("Immich");
  let worm = $state(false);
  let backupConfiguration = $state(true);
  let librariesMode = $state<"all" | "none" | "some">("all");
  let retentionKey = $state<string>(defaultRetentionKey);

  let cron = $state("0 3 * * *");
  let scheduleMode = $state<"daily" | "custom">("daily");
  let scheduleHour = $state(3);
  let scheduleMinute = $state(0);

  const selectedFolders = new SvelteSet<string>();
  const selectedLibraries = new SvelteSet<string>();

  type FolderItem = { label: string; description?: string; folders: string[] };

  let populated = false;

  $effect(() => {
    if (populated || !query.data?.immichState) {
      return;
    }
    populated = true;

    const integration = query.data.immichIntegration;
    if (integration) {
      const config = integration.configuration;
      backupConfiguration = config.backupConfiguration;

      const repository = repositoriesQuery.data?.find(
        (entry) => entry.id === integration.id,
      );

      const policy = repository?.configuration?.retentionPolicy ?? null;
      const matched = retentionChoices.find(
        (choice) => JSON.stringify(choice.policy) === JSON.stringify(policy),
      );
      retentionKey = matched?.key ?? defaultRetentionKey;

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
        (schedule) => schedule.id === integration.scheduleId,
      );

      if (schedule) {
        cron = schedule.cron;

        const match = /(\d+) (\d+) \* \* \*/.exec(cron);
        if (match) {
          scheduleMode = "daily";
          scheduleHour = parseInt(match[2]);
          scheduleMinute = parseInt(match[1]);
        } else {
          scheduleMode = "custom";
        }
      }
    } else {
      for (const folder of query.data.immichState.dataFolders) {
        selectedFolders.add(folder);
      }
    }
  });

  const effectiveCron = $derived(
    scheduleMode === "daily" ? `${scheduleMinute} ${scheduleHour} * * *` : cron,
  );

  const mutation = useConfigureImmichIntegration();

  const onSubmit = () => {
    selectedFolders.add("backups");

    mutation.mutate(
      {
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
        retentionPolicy: worm
          ? null
          : (retentionChoices.find((choice) => choice.key === retentionKey)
              ?.policy ?? null),
      },
      {
        onSuccess: () => {
          onFinish?.();
          onClose?.();
        },
      },
    );
  };

  function applicableFolders(item: FolderItem, available: string[]): string[] {
    return item.folders.filter((folder) => available.includes(folder));
  }

  function isItemChecked(item: FolderItem, available: string[]): boolean {
    const folders = applicableFolders(item, available);
    return (
      folders.length > 0 &&
      folders.every((folder) => selectedFolders.has(folder))
    );
  }

  function toggleItem(item: FolderItem, available: string[]) {
    const folders = applicableFolders(item, available);
    const allOn = folders.every((folder) => selectedFolders.has(folder));
    for (const folder of folders) {
      if (allOn) {
        selectedFolders.delete(folder);
      } else {
        selectedFolders.add(folder);
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
</script>

<FormModal
  title="Backup settings"
  size="large"
  disabled={!validateCron(effectiveCron).isError() ||
    name.length === 0 ||
    mutation.isPending}
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

    <Suspense {query}>
      {#snippet children({ immichState: immich })}
        <Stack gap={2}>
          <Heading size="tiny">What to back up</Heading>

          {#each [{ label: "Photos and videos", description: "Your media uploaded directly to Immich.", folders: ["upload", "profile", "library"], recommended: true }, { label: "Database backups", description: "Albums, faces, and metadata. You'll need this to restore.", folders: ["backups"], required: true }, { label: "Thumbnails and previews", description: "Generated photo previews, can be recreated later.", folders: ["thumbs"], regenerate: true }, { label: "Encoded videos", description: "Generated video previews, can be recreated later.", folders: ["encoded-video"], regenerate: true }] as item (item.label)}
            <label class="select-none">
              <Stack direction="row">
                <Checkbox
                  checked={item.required ||
                    isItemChecked(item, immich!.dataFolders)}
                  onCheckedChange={() => toggleItem(item, immich!.dataFolders)}
                  disabled={item.required}
                />
                <Stack gap={0}>
                  <Text>{item.label}</Text>
                  {#if item.description}
                    <Text size="small" color="secondary"
                      >{item.description}</Text
                    >
                  {/if}
                  {#if item.recommended && !isItemChecked(item, immich!.dataFolders)}
                    <Text size="small" color="danger"
                      >It is highly recommended you back this up!</Text
                    >
                  {/if}
                  {#if item.regenerate && !isItemChecked(item, immich!.dataFolders)}
                    <Text size="small" color="warning"
                      >When restoring, you will see broken previews, use the
                      admin panel to regenerate them.</Text
                    >
                  {/if}
                </Stack>
              </Stack>
            </label>
          {/each}

          <label class="select-none">
            <Stack direction="row">
              <Checkbox bind:checked={backupConfiguration} />
              <Stack gap={0}>
                <Text>Backup configuration</Text>
                <Text size="small" color="secondary"
                  >Saves these settings too.</Text
                >
                {#if !backupConfiguration}
                  <Text size="small" color="warning"
                    >You will need to reconfigure backups from scratch after
                    restoring.</Text
                  >
                {/if}
              </Stack>
            </Stack>
          </label>
        </Stack>

        <Stack gap={2}>
          <Stack gap={0}>
            <Heading size="tiny">External Libraries</Heading>
            <Text size="small" color="secondary">
              External libraries stored outside of Immich can also be included
              in your backup. <br /> By default, all existing and future external
              libraries will be included in your backup.
            </Text>
          </Stack>

          <HStack fullWidth>
            {#each [{ id: "all" as const, label: "All" }, { id: "none" as const, label: "None" }, { id: "some" as const, label: "Pick" }] as option (option.id)}
              <Button
                fullWidth
                size="small"
                variant={librariesMode === option.id ? "filled" : "outline"}
                color={librariesMode === option.id ? "primary" : "secondary"}
                onclick={() => (librariesMode = option.id)}
              >
                {option.label}
              </Button>
            {/each}
          </HStack>

          {#if librariesMode === "all"}
            {#if immich!.libraries.length !== 0}
              <Text size="small" color="secondary"
                >Libraries included: {immich!.libraries
                  .map((item) => item.name)
                  .join(", ")}</Text
              >
            {/if}
          {:else if librariesMode === "some"}
            {#if immich!.libraries.length === 0}
              <Text size="small" color="secondary"
                >No external libraries found.</Text
              >
            {:else}
              <Stack gap={1}>
                {#each immich!.libraries as library (library.id)}
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
          <Heading size="tiny">Schedule</Heading>

          <HStack fullWidth>
            {#each [{ id: "daily" as const, label: "Every day" }, { id: "custom" as const, label: "Custom cron expression" }] as option (option.id)}
              <Button
                fullWidth
                size="small"
                variant={scheduleMode === option.id ? "filled" : "outline"}
                color={scheduleMode === option.id ? "primary" : "secondary"}
                onclick={() => (scheduleMode = option.id)}
              >
                {option.label}
              </Button>
            {/each}
          </HStack>

          {#if scheduleMode === "daily"}
            <Field label="Time">
              <Input
                type="time"
                value={`${String(scheduleHour).padStart(2, "0")}:${String(scheduleMinute).padStart(2, "0")}`}
                oninput={(event) => {
                  const [hours, minutes] = (
                    event.currentTarget as HTMLInputElement
                  ).value.split(":");
                  scheduleHour = Number(hours);
                  scheduleMinute = Number(minutes);
                }}
              />
            </Field>
          {:else}
            <Field label="Cron expression">
              <Input bind:value={cron} placeholder="0 3 * * *" />
            </Field>

            <Text size="small" color="secondary"
              >Your backups will run <span class="lowercase"
                >{cronstrue.toString(cron, {
                  verbose: true,
                })}</span
              ></Text
            >
          {/if}
        </Stack>
      {/snippet}
    </Suspense>

    <Stack gap={2}>
      <Heading size="tiny">Advanced</Heading>
      <Field
        label="Write-only"
        description="Once written, files can't be removed."
      >
        <Switch bind:checked={worm} />
      </Field>

      <Field
        label="Delete old backups"
        description="Older snapshots will be pruned automatically."
        disabled={worm}
      >
        <Select
          options={retentionChoices.map(({ key, label }) => ({
            value: key,
            label,
          }))}
          value={worm ? "never" : retentionKey}
          onChange={(value) => (retentionKey = value)}
        />
      </Field>
    </Stack>
  </Stack>
</FormModal>
