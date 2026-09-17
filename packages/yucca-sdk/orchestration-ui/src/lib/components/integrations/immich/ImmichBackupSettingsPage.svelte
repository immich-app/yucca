<script lang="ts">
  import { Container } from "@immich/ui";
  import ImmichConfiguredGate from "./ImmichConfiguredGate.svelte";
  import ImmichSettingsBackupContents from "./settings/ImmichSettingsBackupContents.svelte";
  import ImmichSettingsSchedule from "./settings/ImmichSettingsSchedule.svelte";
  import ImmichSettingsStorage from "./settings/ImmichSettingsStorage.svelte";

  type Props = {
    onUnconfigured: () => void;
  };

  const { onUnconfigured }: Props = $props();
</script>

<ImmichConfiguredGate {onUnconfigured}>
  {#snippet children()}
    <Container size="large" center>
      <ImmichSettingsBackupContents />
      <ImmichSettingsSchedule />
      <ImmichSettingsStorage />
    </Container>
  {/snippet}
</ImmichConfiguredGate>
