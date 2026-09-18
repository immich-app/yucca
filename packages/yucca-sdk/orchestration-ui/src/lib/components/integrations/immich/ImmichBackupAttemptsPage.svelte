<script lang="ts">
  import RepositoryRunHistoryPage from "$lib/components/backups/run-history/RepositoryRunHistoryPage.svelte";
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
      <RepositoryRunHistoryPage {repository} />
    </Container>
  {/snippet}
</ImmichConfiguredGate>
