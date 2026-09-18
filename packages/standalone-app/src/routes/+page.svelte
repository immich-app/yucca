<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { DashboardPage } from '@futo-org/backups-orchestrator-ui';
</script>

<DashboardPage onViewBackups={() => goto(resolve('/backups'))} />
