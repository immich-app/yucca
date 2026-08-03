<script lang="ts">
  import { goto } from "$app/navigation";
  import { Dashboard } from "@futo-org/backups-orchestrator-ui";

  const { data } = $props();
</script>

<svelte:head><title>Dashboard &middot; FUTO Backups</title></svelte:head>

<Dashboard
  initialData={data.initialData.repositories}
  onViewBackups={() => goto("/dashboard/backups")}
/>
