<script lang="ts">
  import Accordion from "$lib/components/ui/Accordion.svelte";
  import { mdiDownloadBox } from "@mdi/js";
</script>

<Accordion
  title="Storage"
  subtitle="Manage where backups are stored."
  icon={mdiDownloadBox}
>
  <Accordion
    title="FUTO Backups"
    subtitle="Hosted cloud backup storage for your Immich library."
  />
</Accordion>
