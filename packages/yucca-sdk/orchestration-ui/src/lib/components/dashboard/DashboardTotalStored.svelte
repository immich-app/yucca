<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { Badge, Card, CardBody, getByteUnitString } from "@immich/ui";
  import VisualisationGauge from "../ui/VisualisationGauge.svelte";

  type Props = {
    repositories: LocalRepositoryDto[];
  };

  const { repositories }: Props = $props();

  const totalStored = $derived(
    repositories.reduce((sum, repo) => sum + (repo.meter?.sizeBytes ?? 0), 0),
  );

  const estimatedStored = $derived(
    repositories.reduce((sum, repo) => sum + (repo.metrics?.sizeBytes ?? 0), 0),
  );
</script>

<Card class="border-primary-100 shadow-none">
  <CardBody>
    <VisualisationGauge
      title="Total Stored"
      content={getByteUnitString(totalStored)}
    >
      {#snippet subtitle()}
        <Badge size="tiny">Estimated {getByteUnitString(estimatedStored)}</Badge
        >
      {/snippet}
    </VisualisationGauge>
  </CardBody>
</Card>
