<script lang="ts">
  import type {
    BackendDto,
    BackendType,
    RepositoryBackendDto,
  } from "$lib/fetch-client";
  import { getBackendActions } from "$lib/services/backend.service";
  import { Badge, Icon, Text } from "@immich/ui";
  import { mdiCloudOutline, mdiHarddisk, mdiShieldCheckOutline } from "@mdi/js";
  import StackListItem from "../ui/StackListItem.svelte";

  type Props = {
    backend: BackendDto;
    repositoryBackend?: RepositoryBackendDto & { primary?: boolean };
  };

  const { backend, repositoryBackend }: Props = $props();

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

  const { LoginAgain } = $derived(getBackendActions(backend));
</script>

<StackListItem actions={[LoginAgain]}>
  {#snippet icon()}
    <Icon icon={BackendIcons[backend.type]} />
  {/snippet}

  <Text>{BackendNames[backend.type]}</Text>

  {#if repositoryBackend?.primary}
    <Text size="small">(primary)</Text>
  {/if}

  {#snippet trailing()}
    {#if repositoryBackend}
      <Badge
        color={backend.isOnline && repositoryBackend.online
          ? "success"
          : "danger"}
        size="small"
        >{backend.isOnline
          ? repositoryBackend.online
            ? "Available"
            : "Missing"
          : "Offline"}</Badge
      >
    {:else}
      <Badge color={backend.isOnline ? "success" : "danger"} size="small"
        >{backend.isOnline ? "Online" : "Offline"}</Badge
      >
    {/if}
  {/snippet}
</StackListItem>
