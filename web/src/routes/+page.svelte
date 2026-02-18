<script lang="ts">
  import { Button } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";
  import { defaults } from "yucca-sdk";

  import { locale } from "svelte-i18n-lingui";

  async function setLocale(lang: "en" | "ja") {
    const { messages } = await import(`../locales/${lang}.ts`);
    locale.set(lang, messages);
  }
</script>

<main class="p-4">
  <Button
    onclick={() => (location.href = defaults.baseUrl + "/auth/oidc/login")}
    >{$t`Login`}</Button
  >

  <Button onclick={() => setLocale("en")}>Switch to English</Button>
  <Button onclick={() => setLocale("ja")}>Switch to Test</Button>
</main>
