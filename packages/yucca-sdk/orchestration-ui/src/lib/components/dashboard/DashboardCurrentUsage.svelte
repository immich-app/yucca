<script lang="ts">
  import {
    getCustomerBillingPortal,
    startSubscription,
  } from "@futo-org/backups-api-client";
  import { Button, Card, CardBody, HStack } from "@immich/ui";
  import VisualisationGauge from "../ui/VisualisationGauge.svelte";

  function openPortal() {
    getCustomerBillingPortal().then(({ customerPortalUrl }) =>
      window.open(customerPortalUrl, "_blank"),
    );
  }

  function subscribe() {
    startSubscription().then(({ checkoutUrl }) =>
      window.open(checkoutUrl, "_blank"),
    );
  }
</script>

<Card>
  <CardBody>
    <VisualisationGauge title="Current Usage" content="$-/mo" />
    <HStack gap={2}>
      <Button size="tiny" onclick={openPortal}>Go to portal</Button>
      <Button size="tiny" onclick={subscribe}>Subscribe</Button>
    </HStack>
  </CardBody>
</Card>
