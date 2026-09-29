<script lang="ts">
  import type {
    BackendDto,
    BackendType,
    LocalRepositoryDto,
    RepositoryBackendDto,
  } from "$lib/fetch-client";
  import {
    getBackendActions,
    handleStartYuccaLogin,
  } from "$lib/services/backend.service";
  import { Badge, Icon } from "@immich/ui";
  import { mdiCloudOutline, mdiHarddisk, mdiShieldCheckOutline } from "@mdi/js";
  import StackListItem from "../ui/StackListItem.svelte";
  import { t, msg } from "svelte-i18n-lingui";

  type Props = {
    repository?: LocalRepositoryDto;
    backend: BackendDto;
    repositoryBackend?: RepositoryBackendDto & { primary?: boolean };
  };

  const { repository, backend, repositoryBackend }: Props = $props();

  const BackendIcons: Record<BackendType, string> = {
    yucca: mdiShieldCheckOutline,
    local: mdiHarddisk,
    s3: mdiCloudOutline,
  };

  const BackendNames: Record<BackendType, string> = {
    yucca: msg`FUTO Backups`,
    local: msg`Local Storage`,
    s3: msg`S3 Server`,
  };

  const BackendDescriptions: Record<BackendType, string> = {
    yucca: msg`Hosted cloud backup storage`,
    local: msg`A folder on this computer`,
    s3: msg`An S3-compatible server`,
  };

  const title = $derived(
    repositoryBackend?.primary
      ? $t({
          message: "{name} (primary)",
          values: { name: $t(BackendNames[backend.type]) },
        })
      : $t(BackendNames[backend.type]),
  );

  const online = $derived(
    backend.isOnline && (!repositoryBackend || repositoryBackend.online),
  );

  const { LoginAgain, Reconfigure } = $derived(
    getBackendActions(repository, backend, $t, repositoryBackend, () =>
      handleStartYuccaLogin(),
    ),
  );
</script>

<StackListItem {title} actions={[LoginAgain, Reconfigure]}>
  {#snippet icon()}
    <Icon icon={BackendIcons[backend.type]} />
  {/snippet}

  {backend.description ?? $t(BackendDescriptions[backend.type])}

  {#snippet trailing()}
    <Badge color={online ? "success" : "danger"} size="small">
      {#if !backend.isOnline}
        {$t`Offline`}
      {:else if repositoryBackend}
        {repositoryBackend.online ? $t`Active` : $t`Missing on service`}
      {:else}
        {$t`Online`}
      {/if}
    </Badge>
  {/snippet}
</StackListItem>
