<script lang="ts">
  import BackendsList from "$lib/components/backends/BackendsList.svelte";
  import Accordion from "$lib/components/ui/Accordion.svelte";
  import { Stack } from "@immich/ui";
  import { mdiCloudOutline } from "@mdi/js";
  import { t } from "svelte-i18n-lingui";
</script>

<Accordion
  title={$t`Storage backends`}
  subtitle={$t`Manage the storage services your backups can be sent to.`}
  icon={mdiCloudOutline}
>
  <Stack gap={4} class="pt-2">
    <BackendsList actions />
  </Stack>
</Accordion>
