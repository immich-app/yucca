<script lang="ts">
  import { goto } from "$app/navigation";
  import { DashboardPage } from "@futo-org/backups-orchestrator-ui";

  const { data } = $props();
</script>

<svelte:head><title>Dashboard &middot; FUTO Backups</title></svelte:head>

<DashboardPage
  initialData={data.initialData.repositories}
  onViewBackups={() => goto("/dashboard/backups")}
/>
