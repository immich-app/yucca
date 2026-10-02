<script lang="ts">
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import { Badge, Card, CardBody, getByteUnitString } from "@immich/ui";
  import { mdiHarddisk } from "@mdi/js";
  import VisualisationGauge from "../ui/VisualisationGauge.svelte";
  import { t } from "svelte-i18n-lingui";

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
      title={$t`Total Stored`}
      icon={mdiHarddisk}
      content={getByteUnitString(totalStored)}
    >
      {#snippet subtitle()}
        <Badge size="small"
          >{$t({
            message: "Estimated {size}",
            values: { size: getByteUnitString(estimatedStored) },
          })}</Badge
        >
      {/snippet}
    </VisualisationGauge>
  </CardBody>
</Card>
