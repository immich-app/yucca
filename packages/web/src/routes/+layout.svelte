<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";

  import { locale } from "svelte-i18n-lingui";
  import { messages } from "../locales/en";
  import { YuccaContext } from "orchestration-ui";

  locale.set("en", messages);

  const { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<YuccaContext>
  {@render children()}
</YuccaContext>
