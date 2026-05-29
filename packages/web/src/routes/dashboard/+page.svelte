<script lang="ts">
  import { goto } from "$app/navigation";
  import { Dashboard } from "@futo-org/backups-orchestrator-ui";

  const { data } = $props();
</script>

<Dashboard
  initialData={data.initialData.repositories}
  onNavigate={(route) => goto(`/dashboard/${route}`)}
/>
