<script lang="ts">
  import { Card, CardBody } from "@immich/ui";
  import VisualisationGauge from "../ui/VisualisationGauge.svelte";
</script>

<Card>
  <CardBody>
    <VisualisationGauge title="Current Usage" content="$-/mo" />
  </CardBody>
</Card>
