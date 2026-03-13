<script lang="ts">
  import {
    Alert,
    Badge,
    Button,
    Card,
    CardBody,
    FormatBytes,
    getByteUnitString,
    HStack,
    Icon,
    Stack,
    Text,
  } from "@immich/ui";
  import { mdiArrowDown, mdiArrowUp, mdiBackupRestore } from "@mdi/js";
  import { options } from "$lib/options";

  import StackedBarChart from "./visualisations/StackedBarChart.svelte";
  import HeatMap from "./visualisations/HeatMap.svelte";

  type Props = {
    onNavigate?: (route: string) => void;
  };

  const { advanced } = options;

  const { onNavigate }: Props = $props();

  // Mock data — will be wired to getDashboard() later
  const status = { success: 8, inProgress: 2, failed: 3, neverRun: 2 };
  const timeliness = { onTime: 9, late4hr: 3, late8hr: 2, neverRun: 2 };
  const totalBackups =
    status.success + status.inProgress + status.failed + status.neverRun;
  const hasFailures = status.failed > 0;
  const allHealthy =
    totalBackups > 0 && status.failed === 0 && status.neverRun === 0;
  const allNeverRun =
    totalBackups > 0 &&
    status.success === 0 &&
    status.inProgress === 0 &&
    status.failed === 0;
</script>

{#if totalBackups === 0}
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
  {#if allNeverRun}
    <Alert color="info">
      <Text class="grow">{totalBackups} backups configured</Text>
    </Alert>
  {:else if hasFailures}
    <Alert color="danger">
      <Text class="grow"
        >{status.failed} backups failed — check the Backups page for details</Text
      >
    </Alert>
  {:else if allHealthy}
    <Alert color="success">
      <Text class="grow">All {totalBackups} backups healthy</Text>
    </Alert>
  {/if}

  <Card>
    <CardBody>
      <Stack>
        <HStack class="justify-between">
          <Text size="large">Backup Health</Text>
          <Text color="secondary"
            >{status.success} of {totalBackups} successful</Text
          >
        </HStack>

        <div
          style="display: flex; height: 6px; border-radius: 3px; overflow: hidden; gap: 2px;"
        >
          {#if status.success > 0}
            <div
              style="flex: {status.success}; background: var(--immich-ui-success-500); border-radius: 3px;"
            ></div>
          {/if}
          {#if status.inProgress > 0}
            <div
              style="flex: {status.inProgress}; background: var(--immich-ui-warning-500); border-radius: 3px;"
            ></div>
          {/if}
          {#if status.failed > 0}
            <div
              style="flex: {status.failed}; background: var(--immich-ui-danger-500); border-radius: 3px;"
            ></div>
          {/if}
          {#if status.neverRun > 0}
            <div
              style="flex: {status.neverRun}; background: var(--immich-ui-light-400); border-radius: 3px;"
            ></div>
          {/if}
        </div>

        <HStack wrap>
          {#if status.success > 0}
            <Badge size="tiny" color="success"
              >{status.success} Successful</Badge
            >
          {/if}
          {#if status.inProgress > 0}
            <Badge size="tiny" color="warning"
              >{status.inProgress} In Progress</Badge
            >
          {/if}
          {#if status.failed > 0}
            <Badge size="tiny" color="danger">{status.failed} Failed</Badge>
          {/if}
          {#if status.neverRun > 0}
            <Badge size="tiny" color="secondary"
              >{status.neverRun} Never Run</Badge
            >
          {/if}
        </HStack>
      </Stack>
    </CardBody>
  </Card>

  <Card>
    <CardBody>
      <Stack>
        <HStack class="justify-between">
          <Text size="large">Backup Schedule</Text>
          <Text color="secondary"
            >{timeliness.onTime} of {totalBackups} on schedule</Text
          >
        </HStack>

        <div
          style="display: flex; height: 6px; border-radius: 3px; overflow: hidden; gap: 2px;"
        >
          {#if timeliness.onTime > 0}
            <div
              style="flex: {timeliness.onTime}; background: var(--immich-ui-success-500); border-radius: 3px;"
            ></div>
          {/if}
          {#if timeliness.late4hr > 0}
            <div
              style="flex: {timeliness.late4hr}; background: var(--immich-ui-warning-500); border-radius: 3px;"
            ></div>
          {/if}
          {#if timeliness.late8hr > 0}
            <div
              style="flex: {timeliness.late8hr}; background: var(--immich-ui-danger-500); border-radius: 3px;"
            ></div>
          {/if}
          {#if timeliness.neverRun > 0}
            <div
              style="flex: {timeliness.neverRun}; background: var(--immich-ui-light-400); border-radius: 3px;"
            ></div>
          {/if}
        </div>

        <HStack wrap>
          {#if timeliness.onTime > 0}
            <Badge size="tiny" color="success"
              >{timeliness.onTime} On Time</Badge
            >
          {/if}
          {#if timeliness.late4hr > 0}
            <Badge size="tiny" color="warning"
              >{timeliness.late4hr} Late (4hr+)</Badge
            >
          {/if}
          {#if timeliness.late8hr > 0}
            <Badge size="tiny" color="danger"
              >{timeliness.late8hr} Late (8hr+)</Badge
            >
          {/if}
          {#if timeliness.neverRun > 0}
            <Badge size="tiny" color="secondary"
              >{timeliness.neverRun} Never Run</Badge
            >
          {/if}
        </HStack>
      </Stack>
    </CardBody>
  </Card>

  <Card>
    <CardBody>
      <Stack>
        <div class="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <div>
            <Text color="secondary">Cost This Period</Text>
            <Text class="text-2xl">$2.43</Text>
            <Text color="secondary" class="text-xs">Since March 1</Text>
          </div>
          <div>
            <Text color="secondary">Monthly Estimate</Text>
            <Text class="text-2xl">$13.52<span class="text-xs"> /mo</span></Text
            >
            <Text color="secondary" class="text-xs">
              <Icon icon={mdiArrowDown} class="inline text-success-500" /> $2.52 less
              than last month
            </Text>
          </div>
          <div>
            <Text color="secondary">Total Stored</Text>
            <Text class="text-2xl"
              ><FormatBytes bytes={8_720_000_000_000} /></Text
            >
            <Text color="secondary" class="text-xs">
              <Icon icon={mdiArrowUp} class="inline text-info-500" />
              <FormatBytes bytes={320_000_000_000} /> in 24h
            </Text>
          </div>
        </div>

        <hr
          style="border: none; border-top: 1px solid var(--immich-ui-default-border);"
        />

        <div class="grid grid-cols-2 gap-5 opacity-80 sm:grid-cols-3">
          <div>
            <Text color="secondary" class="text-xs">Avg. Backup Time</Text>
            <Text class="text-xl">12m 14s</Text>
          </div>
          <div>
            <Text color="secondary" class="text-xs">Daily Backup Time</Text>
            <Text class="text-xl">1h 24m</Text>
          </div>
          <div>
            <Text color="secondary" class="text-xs">Space Saved</Text>
            <Text class="text-xl">4.7x</Text>
          </div>
        </div>
      </Stack>
    </CardBody>
  </Card>

  {#if advanced}
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
