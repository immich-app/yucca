<script lang="ts">
  import { page } from "$app/state";
  import { defaults } from "@futo-org/backups-api-client";
  import {
    Alert,
    Button,
    Card,
    CardBody,
    Heading,
    Input,
    VStack,
  } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  let { data } = $props();

  let inviteCode = $state("");

  const notAllowed = page.url.searchParams.get("error") === "not_allowed";

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      return;
    }
    location.href =
      defaults.baseUrl +
      "api/auth/oidc/login?invite_code=" +
      encodeURIComponent(code);
  };

  const join = () => {
    location.href =
      defaults.baseUrl +
      "api/auth/oidc/login?discord_invite=" +
      encodeURIComponent(data.token);
  };
</script>

<svelte:head><title>{$t`Invite code`} &middot; FUTO Backups</title></svelte:head
>

<main class="flex min-h-screen items-center justify-center p-4">
  <VStack gap={6} class="w-full max-w-sm items-center">
    <Card>
      <CardBody>
        <VStack>
          <Heading>FUTO Backups</Heading>
          {#if notAllowed}
            <Alert color="warning"
              >{$t`Your email isn't part of the beta yet.`}</Alert
            >
          {/if}
          {#if data.invite}
            <p>
              {$t`@${data.invite.discordUsername}, you're invited to the FUTO Backups beta. Sign in to join.`}
            </p>
            <Button onclick={join}>{$t`Join the beta`}</Button>
          {:else}
            {#if data.token}
              <Alert color="warning"
                >{$t`This invite link has expired. Go back to Discord and claim it again to get a fresh one.`}</Alert
              >
            {/if}
            <p>{$t`Enter an invite code to continue.`}</p>
            <form onsubmit={submit}>
              <VStack>
                <Input
                  bind:value={inviteCode}
                  placeholder={$t`Invite code`}
                  aria-label={$t`Invite code`}
                />
                <Button type="submit">{$t`Continue`}</Button>
              </VStack>
            </form>
          {/if}
        </VStack>
      </CardBody>
    </Card>
  </VStack>
</main>
