<script lang="ts">
  import { BackupsList } from "@futo-org/backups-orchestrator-ui";
  import { Heading } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  const { data } = $props();
</script>

<svelte:head><title>Backups &middot; FUTO Backups</title></svelte:head>

<Heading tag="h1" class="sr-only">{$t`Backups`}</Heading>

<BackupsList initialData={data.initialData} />
