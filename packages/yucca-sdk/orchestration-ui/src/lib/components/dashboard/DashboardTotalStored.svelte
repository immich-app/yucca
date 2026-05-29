<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { Card, CardBody, getByteUnitString } from "@immich/ui";
  import VisualisationGauge from "../ui/VisualisationGauge.svelte";

  type Props = {
    repositories: LocalRepositoryDto[];
  };

  const { repositories }: Props = $props();

  const totalStored = $derived(
    repositories.reduce(
      (sum, repo) => sum + (repo.metrics?.sizeBytes ?? 0),
      0,
    ),
  );
</script>

<Card>
  <CardBody>
    <VisualisationGauge
      title="Total Stored"
      content={getByteUnitString(totalStored)}
    />
  </CardBody>
</Card>
