<script lang="ts">
  import SettingsBilling from "$lib/components/settings/SettingsBilling.svelte";
  import SettingsNotifications from "$lib/components/settings/SettingsNotifications.svelte";
  import SettingsSchedule from "$lib/components/settings/SettingsSchedule.svelte";
  import { Container } from "@immich/ui";
  import ImmichSettingsBackupContents from "./settings/ImmichSettingsBackupContents.svelte";
  import ImmichSettingsStorage from "./settings/ImmichSettingsStorage.svelte";
</script>

<Container size="large" center>
  <ImmichSettingsBackupContents onSave={() => void 0} />
  <SettingsSchedule onSave={() => void 0} onReset={() => void 0} />
  <ImmichSettingsStorage />
  <SettingsNotifications onSave={() => void 0} />
  <SettingsBilling onManageBilling={() => void 0} />
</Container>
