<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { formatDuration } from "$lib/utils/format";
  import { Card, CardBody } from "@immich/ui";
  import VisualisationGauge from "../ui/VisualisationGauge.svelte";

  type Props = {
    repositories: LocalRepositoryDto[];
  };

  const { repositories }: Props = $props();

  const durations = $derived(
    repositories
      .map((repo) => repo.metrics?.lastBackupDuration)
      .filter((duration): duration is number => duration != null),
  );

  const avgBackupTime = $derived(
    durations.length > 0
      ? durations.reduce((sum, duration) => sum + duration, 0) /
          durations.length
      : undefined,
  );
</script>

<Card>
  <CardBody>
    <VisualisationGauge
      title="Avg. Backup Time"
      content={avgBackupTime != null ? formatDuration(avgBackupTime) : "—"}
    />
  </CardBody>
</Card>
