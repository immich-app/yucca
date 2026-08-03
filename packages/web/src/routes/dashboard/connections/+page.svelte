<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import {
    CONNECTION_TYPES,
    type ConnectionTypeMeta,
  } from "$lib/components/connections/connection-types";
  import CreateResticModal from "$lib/components/connections/CreateResticModal.svelte";
  import ManageTokensModal from "$lib/components/connections/ManageTokensModal.svelte";
  import NewConnectionModal from "$lib/components/connections/NewConnectionModal.svelte";
  import ResticResultModal from "$lib/components/connections/ResticResultModal.svelte";
  import {
    type ConnectionDto,
    type ConnectionResticResponseDto,
    type RepositoryWithMetricsDto,
  } from "@futo-org/backups-api-client";
  import {
    Badge,
    Button,
    Card,
    CardBody,
    CardHeader,
    CardTitle,
    FormatBytes,
    Heading,
    HStack,
    Icon,
    modalManager,
    Stack,
    Text,
  } from "@immich/ui";
  import { mdiKeyChain, mdiPlus } from "@mdi/js";
  import { t } from "svelte-i18n-lingui";

  const { data } = $props();

  const canRestic = $derived(
    data.user?.features?.["connection-restic"] === true,
  );

  const visibleTypes = $derived(
    CONNECTION_TYPES.filter((meta) => meta.type !== "restic" || canRestic),
  );

  const reposByConnection = $derived.by(() => {
    const map = new Map<string, RepositoryWithMetricsDto[]>();
    for (const repo of data.repositories) {
      const list = map.get(repo.connectionId) ?? [];
      list.push(repo);
      map.set(repo.connectionId, list);
    }
    return map;
  });

  const connectionsByType = $derived.by(() => {
    const map = new Map<string, ConnectionDto[]>();
    for (const connection of data.connections) {
      const list = map.get(connection.type) ?? [];
      list.push(connection);
      map.set(connection.type, list);
    }
    return map;
  });

  const startCreate = (type: string) => {
    if (type === "restic") {
      modalManager.open(CreateResticModal, { onCreated });
    }
  };

  const onCreated = (result: ConnectionResticResponseDto) => {
    void invalidateAll();
    modalManager.open(ResticResultModal, {
      url: result.url,
      repositoryName: result.repository.name,
    });
  };

  const openNewConnection = () =>
    modalManager.open(NewConnectionModal, {
      types: visibleTypes.map((meta) => meta.type),
      onPick: startCreate,
    });

  const openTokens = (repo: RepositoryWithMetricsDto) =>
    modalManager.open(ManageTokensModal, {
      repositoryId: repo.id,
      repositoryName: repo.name,
    });

  const typeColor = (type: string) =>
    type === "immich" ? "primary" : "success";
</script>

<svelte:head><title>{$t`Connections`} &middot; FUTO Backups</title></svelte:head
>

<Stack gap={5}>
  <HStack class="justify-between">
    <Heading tag="h1" size="small">{$t`Connections`}</Heading>
    <Button shape="round" leadingIcon={mdiPlus} onclick={openNewConnection}
      >{$t`New connection`}</Button
    >
  </HStack>

  <Text color="muted"
    >{$t`Connections are the sources of data that back up to us. Right now, that's mostly Immich.`}</Text
  >

  {#each visibleTypes as meta (meta.type)}
    {@const connections = connectionsByType.get(meta.type) ?? []}
    <Stack gap={2}>
      <HStack class="justify-between">
        <HStack gap={2}>
          <Icon icon={meta.icon} />
          <Heading size="tiny">{meta.label}</Heading>
        </HStack>
        {#if meta.addable}
          <Button
            size="tiny"
            shape="round"
            variant="outline"
            leadingIcon={mdiPlus}
            onclick={() => startCreate(meta.type)}
          >
            {$t`Add ${meta.label} connection`}
          </Button>
        {/if}
      </HStack>

      {#if connections.length === 0}
        <Text size="small" color="muted">{meta.limitation}</Text>
      {/if}

      {#each connections as connection (connection.id)}
        {@const repos = reposByConnection.get(connection.id) ?? []}
        <Card>
          <CardHeader>
            <HStack class="justify-between">
              <HStack gap={2}>
                <CardTitle>{connection.name}</CardTitle>
                <Badge color={typeColor(connection.type)}
                  >{connection.type}</Badge
                >
              </HStack>
              <Text size="small" color="muted">
                {$t`${connection.repositoryCount} repositories`} ·
                <FormatBytes bytes={connection.billableBytes} />
                {$t`billed`}
              </Text>
            </HStack>
          </CardHeader>
          {#if meta.addable && repos.length > 0}
            <CardBody>
              <Stack
                gap={0}
                class="divide-y rounded-2xl border overflow-hidden"
              >
                {#each repos as repo (repo.id)}
                  <HStack class="justify-between p-3">
                    <Stack gap={0}>
                      <Text>{repo.name}</Text>
                      {#if repo.meter}
                        <Text size="tiny" color="muted">
                          <FormatBytes bytes={repo.meter.sizeBytes} /> · {$t`${
                            repo.meter.objectCount
                          } objects`}
                        </Text>
                      {/if}
                    </Stack>
                    <Button
                      size="tiny"
                      shape="round"
                      variant="outline"
                      color="secondary"
                      onclick={() => openTokens(repo)}
                    >
                      <Icon icon={mdiKeyChain} />
                      {$t`Access keys`}
                    </Button>
                  </HStack>
                {/each}
              </Stack>
            </CardBody>
          {/if}
        </Card>
      {/each}
    </Stack>
  {/each}
</Stack>
