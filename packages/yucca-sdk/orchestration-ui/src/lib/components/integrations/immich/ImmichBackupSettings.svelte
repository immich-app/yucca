<script lang="ts">
  import { Container } from "@immich/ui";
  import ImmichSettingsBackupContents from "./settings/ImmichSettingsBackupContents.svelte";
  import ImmichSettingsSchedule from "./settings/ImmichSettingsSchedule.svelte";
  import ImmichSettingsStorage from "./settings/ImmichSettingsStorage.svelte";
</script>

<Container size="large" center>
  <ImmichSettingsBackupContents />
  <ImmichSettingsSchedule />
  <ImmichSettingsStorage />
</Container>
