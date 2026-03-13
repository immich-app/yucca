<script lang="ts">
  import {
    Alert,
    Button,
    Card,
    CardBody,
    getByteUnitString,
    Icon,
    Stack,
    Text,
  } from "@immich/ui";
  import { mdiBackupRestore } from "@mdi/js";
  import { options } from "$lib/options";

  import BackupHealth from "./BackupHealth.svelte";
  import BackupStats from "./BackupStats.svelte";
  import ActiveJobs from "./ActiveJobs.svelte";
  import RecentBackups from "./RecentBackups.svelte";
  import StackedBarChart from "./visualisations/StackedBarChart.svelte";
  import HeatMap from "./visualisations/HeatMap.svelte";
  import { getProvider } from "$lib/providers";
  import { onMount } from "svelte";
  import type { LocalRepositoryDto } from "$lib/fetch-client";

  type Props = {
    onNavigate?: (route: string) => void;
  };

  const { advanced } = options;

  const { onNavigate }: Props = $props();

  let repositories = $state<LocalRepositoryDto[]>([]);

  const provider = getProvider();

  onMount(() =>
    provider
      .getRepositories()
      .then((data) => (repositories = data.repositories)),
  );
</script>

{#if repositories.length === 0}
  <Card>
    <CardBody>
      <div class="flex flex-col items-center gap-4 py-8">
        <Icon icon={mdiBackupRestore} size="48" color="muted" />
        <Stack class="items-center gap-1">
          <Text size="large">No backups configured yet</Text>
          <Text color="secondary" class="text-center max-w-md"
            >Once you set up a backup, this dashboard will show its health,
            schedule, and storage usage at a glance.</Text
          >
        </Stack>
        {#if onNavigate}
          <Button color="primary" onclick={() => onNavigate("backups")}
            >Set up your first backup</Button
          >
        {/if}
      </div>
    </CardBody>
  </Card>
{:else}
  <BackupHealth {repositories} />

  <BackupStats {repositories} />

  <ActiveJobs />

  <RecentBackups
    {repositories}
    onNavigate={onNavigate ? () => onNavigate("backups") : undefined}
  />

  {#if $advanced}
    <Alert>Mock data provided for advanced graphs below.</Alert>

    <Stack direction="row">
      <Card class="flex-1">
        <CardBody>
          <Stack>
            <Text size="large">Storage Breakdown</Text>
            <StackedBarChart
              categoryKey="day"
              keys={["Latest Snapshots", "Older Snapshots"]}
              colours={[
                "var(--immich-ui-primary-500)",
                "var(--immich-ui-primary-300)",
              ]}
              formatValue={(v) => getByteUnitString(v, undefined, 1)}
              data={[
                {
                  day: "Mon",
                  "Latest Snapshots": 1_200_000_000,
                  "Older Snapshots": 2_400_000_000,
                },
                {
                  day: "Tue",
                  "Latest Snapshots": 1_400_000_000,
                  "Older Snapshots": 2_800_000_000,
                },
                {
                  day: "Wed",
                  "Latest Snapshots": 1_100_000_000,
                  "Older Snapshots": 2_600_000_000,
                },
                {
                  day: "Thu",
                  "Latest Snapshots": 1_500_000_000,
                  "Older Snapshots": 3_000_000_000,
                },
                {
                  day: "Fri",
                  "Latest Snapshots": 1_300_000_000,
                  "Older Snapshots": 2_500_000_000,
                },
                {
                  day: "Sat",
                  "Latest Snapshots": 800_000_000,
                  "Older Snapshots": 1_900_000_000,
                },
                {
                  day: "Sun",
                  "Latest Snapshots": 700_000_000,
                  "Older Snapshots": 1_700_000_000,
                },
              ]}
            />
          </Stack>
        </CardBody>
      </Card>
      <Card class="flex-1">
        <CardBody>
          <Stack>
            <Text size="large">Transfer Bandwidth</Text>
            <StackedBarChart
              categoryKey="day"
              keys={["Upload", "Download"]}
              colours={[
                "var(--immich-ui-info-500)",
                "var(--immich-ui-info-300)",
              ]}
              formatValue={(v) => getByteUnitString(v, undefined, 1)}
              data={[
                { day: "Mon", Upload: 3_200_000_000, Download: 100_000_000 },
                { day: "Tue", Upload: 2_800_000_000, Download: 400_000_000 },
                { day: "Wed", Upload: 4_100_000_000, Download: 200_000_000 },
                { day: "Thu", Upload: 3_500_000_000, Download: 1_800_000_000 },
                { day: "Fri", Upload: 2_900_000_000, Download: 100_000_000 },
                { day: "Sat", Upload: 1_200_000_000, Download: 0 },
                { day: "Sun", Upload: 1_000_000_000, Download: 0 },
              ]}
            />
          </Stack>
        </CardBody>
      </Card>
      {@const heatMapRows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
      {@const heatMapCols = Array.from({ length: 24 }, (_, i) => {
        if (i === 0) return "12a";
        if (i < 12) return `${i}a`;
        if (i === 12) return "12p";
        return `${i - 12}p`;
      })}
      {@const heatMapData = heatMapRows.flatMap((day) =>
        heatMapCols.map((hour) => ({
          row: day,
          col: hour,
          value: Math.round(Math.exp(Math.random() * 5)),
        })),
      )}
      <Card class="flex-1">
        <CardBody>
          <Stack>
            <Text size="large">Job Activity</Text>
            <HeatMap
              data={heatMapData}
              rows={heatMapRows}
              cols={heatMapCols}
              colours={[
                "var(--immich-ui-light-200)",
                "var(--immich-ui-primary-400)",
              ]}
            />
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  {/if}
{/if}
