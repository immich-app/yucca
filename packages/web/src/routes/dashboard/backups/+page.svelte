<script lang="ts">
  import { BackupsList } from "@futo-org/backups-orchestrator-ui";
  import { Heading, Stack } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  const { data } = $props();
</script>

<svelte:head><title>Backups &middot; FUTO Backups</title></svelte:head>

<Stack gap={6}>
  <Heading tag="h1" size="medium">{$t`Backups`}</Heading>

  <BackupsList initialData={data.initialData} />
</Stack>
