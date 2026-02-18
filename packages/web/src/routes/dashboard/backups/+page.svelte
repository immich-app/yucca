<script lang="ts">
  import { BackupsList } from "orchestration-ui";

  const { data } = $props();
</script>

<BackupsList initialData={data.initialData} />
