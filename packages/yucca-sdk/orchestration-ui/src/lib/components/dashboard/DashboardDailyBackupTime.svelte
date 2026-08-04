<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { formatDuration } from "$lib/utils/format";
  import { Card, CardBody } from "@immich/ui";
  import VisualisationGauge from "../ui/VisualisationGauge.svelte";

  type Props = {
    repositories: LocalRepositoryDto[];
  };

  const { repositories }: Props = $props();

  const dailyBackupTime = $derived(
    repositories
      .map((repo) => repo.metrics?.lastBackupDuration)
      .filter((duration): duration is number => duration != null)
      .reduce<number | undefined>(
        (sum, duration) => (sum ?? 0) + duration,
        undefined,
      ),
  );
</script>

<Card class="border-primary-100 shadow-none">
  <CardBody>
    <VisualisationGauge
      title="Daily Backup Time"
      content={dailyBackupTime != null ? formatDuration(dailyBackupTime) : "—"}
    />
  </CardBody>
</Card>
