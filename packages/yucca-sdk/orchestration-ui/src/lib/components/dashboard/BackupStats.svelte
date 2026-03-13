<script lang="ts">
  import { Card, CardBody, getByteUnitString, Icon, Stack } from "@immich/ui";
  import { mdiArrowDown, mdiArrowUp } from "@mdi/js";
  import { Duration } from "luxon";
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import Gauge from "./visualisations/Gauge.svelte";

  type Props = {
    repositories: LocalRepositoryDto[];
    compact?: boolean;
  };

  const { repositories, compact = true }: Props = $props();

  const durations = $derived(
    repositories
      .map((repo) => repo.metrics?.lastBackupDuration)
      .filter((d): d is number => d != null),
  );

  const avgBackupTime = $derived(
    durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : undefined,
  );

  const dailyBackupTime = $derived(
    durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) : undefined,
  );

  const totalStored = $derived(
    repositories.reduce((sum, repo) => sum + (repo.metrics?.sizeBytes ?? 0), 0),
  );

  const formatDuration = (ms: number) =>
    Duration.fromMillis(ms).rescale().toHuman({ unitDisplay: "narrow" });
</script>

{#snippet costSubtitle()}
  Since March 1
{/snippet}

{#snippet estimateSubtitle()}
  <Icon icon={mdiArrowDown} class="inline text-success-500" /> $2.52 less than last
  month
{/snippet}

{#snippet totalStoredSubtitle()}
  <Icon icon={mdiArrowUp} class="inline text-info-500" />
  {getByteUnitString(320_000_000_000)} in 24h
{/snippet}

{#if compact}
  <Card>
    <CardBody>
      <div class="grid grid-cols-2 gap-5 sm:grid-cols-3">
        <Gauge
          title="Avg. Backup Time"
          content={avgBackupTime != null ? formatDuration(avgBackupTime) : "—"}
        />
        <Gauge
          title="Daily Backup Time"
          content={dailyBackupTime != null
            ? formatDuration(dailyBackupTime)
            : "—"}
        />
        <Gauge title="Total Stored" content={getByteUnitString(totalStored)} />
      </div>
    </CardBody>
  </Card>
{:else}
  <Card>
    <CardBody>
      <Stack>
        <div class="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Gauge
            title="Cost This Period"
            content="$2.43"
            subtitle={costSubtitle}
          />
          <Gauge
            title="Monthly Estimate"
            content="$13.52 /mo"
            subtitle={estimateSubtitle}
          />
          <Gauge
            title="Total Stored"
            content={getByteUnitString(totalStored)}
            subtitle={totalStoredSubtitle}
          />
        </div>

        <hr
          style="border: none; border-top: 1px solid var(--immich-ui-default-border);"
        />

        <div class="grid grid-cols-2 gap-5 opacity-80 sm:grid-cols-3">
          <Gauge
            compact
            title="Avg. Backup Time"
            content={avgBackupTime != null
              ? formatDuration(avgBackupTime)
              : "—"}
          />
          <Gauge
            compact
            title="Daily Backup Time"
            content={dailyBackupTime != null
              ? formatDuration(dailyBackupTime)
              : "—"}
          />
          <Gauge compact title="Space Saved" content="4.7x" />
        </div>
      </Stack>
    </CardBody>
  </Card>
{/if}
