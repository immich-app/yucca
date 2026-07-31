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
    yucca: "FUTO Backups",
    local: "Local Storage",
    s3: "S3 Server",
  };

  const BackendDescriptions: Record<BackendType, string> = {
    yucca: "Hosted cloud backup storage",
    local: "A folder on this computer",
    s3: "An S3-compatible server",
  };

  const title = $derived(
    repositoryBackend?.primary
      ? `${BackendNames[backend.type]} (primary)`
      : BackendNames[backend.type],
  );

  const online = $derived(
    backend.isOnline && (!repositoryBackend || repositoryBackend.online),
  );

  const { LoginAgain, Reconfigure } = $derived(
    getBackendActions(repository, backend, repositoryBackend, () =>
      handleStartYuccaLogin(),
    ),
  );
</script>

<StackListItem {title} actions={[LoginAgain, Reconfigure]}>
  {#snippet icon()}
    <Icon icon={BackendIcons[backend.type]} />
  {/snippet}

  {backend.description ?? BackendDescriptions[backend.type]}

  {#snippet trailing()}
    <Badge color={online ? "primary" : "danger"} size="small">
      {#if !backend.isOnline}
        Offline
      {:else if repositoryBackend}
        {repositoryBackend.online ? "Active" : "Missing on service"}
      {:else}
        Online
      {/if}
    </Badge>
  {/snippet}
</StackListItem>
