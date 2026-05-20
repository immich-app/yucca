<script lang="ts">
  import { BackupsList } from "@futo-org/backups-orchestrator-ui";

  const { data } = $props();
</script>

<BackupsList initialData={data.initialData} />
