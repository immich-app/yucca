<script lang="ts">
  import { BackupsList } from "@futo-org/backups-orchestrator-ui";

  const { data } = $props();
</script>

<svelte:head><title>Backups &middot; FUTO Backups</title></svelte:head>

<BackupsList initialData={data.initialData} />
