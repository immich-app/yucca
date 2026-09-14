<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Dashboard } from '@futo-org/backups-orchestrator-ui';
</script>

<Dashboard onViewBackups={() => goto(resolve('/backups'))} />
