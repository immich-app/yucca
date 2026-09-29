<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";

  import { locale } from "svelte-i18n-lingui";
  import {
    defaultMessages,
    YuccaContext,
  } from "@futo-org/backups-orchestrator-ui";

  locale.set("en", defaultMessages);

  const { children } = $props();
</script>

<svelte:head>
  <title>FUTO Backups</title>
  <link rel="icon" href={favicon} />
</svelte:head>
<YuccaContext>
  {@render children()}
</YuccaContext>
