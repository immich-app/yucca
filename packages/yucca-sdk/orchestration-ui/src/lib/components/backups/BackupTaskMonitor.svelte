<script lang="ts">
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import { useBackupTaskMonitor } from "$lib/services/runHistory.service";
</script>

<OnEvents {...useBackupTaskMonitor()} />
