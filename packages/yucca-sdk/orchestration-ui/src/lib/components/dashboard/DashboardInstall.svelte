<script lang="ts">
  import { Button, Card, CardBody, CardHeader, CardTitle, Logo } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";
</script>

<Card class="border-primary-100 shadow-none">
  <CardHeader>
    <CardTitle tag="h2">{$t`Install FUTO Backups`}</CardTitle>
  </CardHeader>
  <CardBody>
    <Button href="https://my.immich.app/link?target=backups" variant="outline" size="small">
      <Logo variant="icon" size="tiny" />
      {$t`Setup on Immich`}
    </Button>
  </CardBody>
</Card>
