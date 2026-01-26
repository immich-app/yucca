<script lang="ts">
  import {
    SupporterBadge,
    Logo,
    Heading,
    Text,
    VStack,
    Button,
  } from "@immich/ui";
  import { t, plural } from "svelte-i18n-lingui";
  import { onMount } from "svelte";
  import { defaults, hello, oidcAuthorize, protectedRoute } from "yucca-sdk";

  let value = $state("Loading from API...");

  onMount(() => {
    hello().then((v) => (value = v!));
  });

  import { locale } from "svelte-i18n-lingui";
  import { user } from "$lib/stores/user.store";

  async function setLocale(lang: "en" | "ja") {
    const { messages } = await import(`../locales/${lang}.ts`);
    locale.set(lang, messages);
  }
</script>

<main class="p-4">
  <VStack>
    <SupporterBadge effect="always">
      <Logo size="large" variant="icon" />
      <Heading tag="h1" size="large" color="primary"
        >{$t`Purchase Immich`}</Heading
      >
    </SupporterBadge>

    <Text>{$t`From the ${$t`yucca API`}: ${value}`}</Text>

    <Text
      >{$plural(5, {
        one: "# item",
        other: "# items",
      })}</Text
    >

    <Button onclick={() => setLocale("en")}>Switch to English</Button>
    <Button onclick={() => setLocale("ja")}>Switch to Test</Button>

    {#if $user}
      <Text>Currently logged in.</Text>
      <Button
        onclick={() => (location.href = defaults.baseUrl + "/auth/logout")}
        >Log out</Button
      >
    {:else}
      <Button
        onclick={() =>
          oidcAuthorize().then(
            ({ redirectTo }) => (location.href = redirectTo),
          )}>Login</Button
      >
    {/if}
  </VStack>
</main>
