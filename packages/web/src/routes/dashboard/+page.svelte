<script lang="ts">
  import { goto } from "$app/navigation";
  import { DashboardPage } from "@futo-org/backups-orchestrator-ui";
  import { Heading } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  const { data } = $props();
</script>

<svelte:head><title>Dashboard &middot; FUTO Backups</title></svelte:head>

<Heading tag="h1" class="sr-only">{$t`Dashboard`}</Heading>

<DashboardPage
  initialData={data.initialData.repositories}
  onViewBackups={() => goto("/dashboard/backups")}
/>
