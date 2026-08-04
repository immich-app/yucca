<script lang="ts">
  import SettingsSchedule from "$lib/components/settings/SettingsSchedule.svelte";
  import { Container } from "@immich/ui";
  import ImmichSettingsBackupContents from "./settings/ImmichSettingsBackupContents.svelte";
  import ImmichSettingsStorage from "./settings/ImmichSettingsStorage.svelte";
</script>

<Container size="large" center>
  <ImmichSettingsBackupContents />
  <SettingsSchedule />
  <ImmichSettingsStorage />
</Container>
