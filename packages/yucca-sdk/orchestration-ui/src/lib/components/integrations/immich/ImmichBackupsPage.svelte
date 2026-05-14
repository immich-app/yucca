<script lang="ts">
  import ImmichManageBackup from "./ImmichManageBackup.svelte";
  import ImmichOnboardingSetupFlow from "./ImmichOnboardingSetupFlow.svelte";

  type Props = {
    onExit: () => void;
  };

  const { onExit }: Props = $props();
</script>

<ImmichOnboardingSetupFlow {onExit}>
  <ImmichManageBackup />
</ImmichOnboardingSetupFlow>
