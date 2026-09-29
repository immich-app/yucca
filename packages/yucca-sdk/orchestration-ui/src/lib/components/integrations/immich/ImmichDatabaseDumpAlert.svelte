<script lang="ts">
  import {
    useConfigureImmichDatabaseDump,
    useIgnoreImmichDatabaseDumpWarning,
    useImmichBackupStatus,
  } from "$lib/services/immich.integration.service";
  import { Alert, Button, HStack, Stack, Text } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  const backup = useImmichBackupStatus();
  const configure = useConfigureImmichDatabaseDump();
  const ignore = useIgnoreImmichDatabaseDumpWarning();
</script>

{#if backup.needsAttention}
  <Alert color="warning" title={$t`Immich database backups are still enabled`}>
    <Stack gap={3}>
      <Text size="small">
        {$t`FUTO Backups already creates the same database backups as Immich.`}
        <br />
        {$t`Most users should select "use FUTO Backups only".`}
      </Text>
      <HStack gap={2}>
        <Button
          size="small"
          color="primary"
          loading={configure.isPending}
          onclick={() => configure.mutate({ enabled: false })}
        >
          {$t`Use FUTO Backups only`}
        </Button>
        <Button
          size="small"
          variant="ghost"
          loading={ignore.isPending}
          onclick={() => ignore.mutate()}
        >
          {$t`Ignore`}
        </Button>
      </HStack>
    </Stack>
  </Alert>
{/if}
