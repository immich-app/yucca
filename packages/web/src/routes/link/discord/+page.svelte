<script lang="ts">
  import { handleError } from "$lib/utils/handle-error";
  import {
    confirmDiscordLinkRequest,
    defaults,
  } from "@futo-org/backups-api-client";
  import { Alert, Button, Card, CardBody, Heading, VStack } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  let { data } = $props();

  let linked = $state(false);
  let busy = $state(false);

  const login = () => {
    location.href =
      defaults.baseUrl +
      "api/auth/oidc/login?redirect=" +
      encodeURIComponent("/link/discord?code=" + data.code);
  };

  const confirm = async () => {
    busy = true;
    try {
      await confirmDiscordLinkRequest(data.code);
      linked = true;
    } catch (error) {
      handleError(error, $t`Unable to link your Discord account.`);
    } finally {
      busy = false;
    }
  };
</script>

<svelte:head
  ><title>{$t`Link Discord`} &middot; FUTO Backups</title></svelte:head
>

<main class="flex min-h-screen items-center justify-center p-4">
  <VStack gap={6} class="w-full max-w-sm items-center">
    <Card>
      <CardBody>
        <VStack>
          <Heading>FUTO Backups</Heading>
          {#if linked}
            <Alert color="success"
              >{$t`Discord account linked. You can head back to Discord.`}</Alert
            >
          {:else if !data.user}
            <p>{$t`Log in to link your Discord account.`}</p>
            <Button onclick={login}>{$t`Login`}</Button>
          {:else if !data.request}
            <Alert color="warning"
              >{$t`This link is invalid or has expired. Click the support button in Discord to get a new one.`}</Alert
            >
          {:else}
            <p>
              {$t`Link Discord account @${data.request.discordUsername} to ${data.user.email}?`}
            </p>
            <Button onclick={confirm} disabled={busy}>{$t`Link account`}</Button
            >
          {/if}
        </VStack>
      </CardBody>
    </Card>
  </VStack>
</main>
