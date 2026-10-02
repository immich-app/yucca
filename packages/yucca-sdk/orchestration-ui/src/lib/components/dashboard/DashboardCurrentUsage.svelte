<script lang="ts">
  import { Card, CardBody } from "@immich/ui";
  import { mdiChartBar } from "@mdi/js";
  import { t } from "svelte-i18n-lingui";
  import VisualisationGauge from "../ui/VisualisationGauge.svelte";
</script>

<Card class="border-primary-100 shadow-none">
  <CardBody>
    <VisualisationGauge
      title={$t`Current Usage`}
      content="$-/mo"
      icon={mdiChartBar}
    />
  </CardBody>
</Card>
