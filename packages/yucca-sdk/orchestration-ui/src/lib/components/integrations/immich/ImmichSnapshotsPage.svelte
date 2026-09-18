<script lang="ts">
  import RepositorySnapshotsPage from "$lib/components/backups/snapshots-list/RepositorySnapshotsPage.svelte";
  import { Container } from "@immich/ui";
  import ImmichConfiguredGate from "./ImmichConfiguredGate.svelte";

  type Props = {
    onUnconfigured: () => void;
  };

  const { onUnconfigured }: Props = $props();
</script>

<ImmichConfiguredGate {onUnconfigured}>
  {#snippet children(repository)}
    <Container size="medium" center>
      <RepositorySnapshotsPage {repository} immich />
    </Container>
  {/snippet}
</ImmichConfiguredGate>
