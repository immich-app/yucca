<script lang="ts">
  import { Card, CardBody } from "@immich/ui";
  import VisualisationGauge from "../ui/VisualisationGauge.svelte";
</script>

<Card class="border-primary-100 shadow-none">
  <CardBody>
    <VisualisationGauge title="Current Usage" content="$-/mo" />
  </CardBody>
</Card>
