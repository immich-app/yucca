<script lang="ts">
  import FutoBackupsLogo from "$lib/components/FutoBackupsLogo.svelte";
  import { defaults } from "@futo-org/backups-api-client";
  import { Button, Card, CardBody, Heading, VStack } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";
</script>

<svelte:head><title>{$t`Login`} &middot; FUTO Backups</title></svelte:head>

<main class="flex min-h-screen items-center justify-center p-4">
  <VStack gap={6} class="w-full max-w-sm items-center">
    <Card>
      <CardBody>
        <VStack>
          <Heading tag="h1"><FutoBackupsLogo class="h-12" /></Heading>
          <Button href={defaults.baseUrl + "api/auth/oidc/login"}
            >{$t`Login`}</Button
          >
        </VStack>
      </CardBody>
    </Card>
  </VStack>
</main>
