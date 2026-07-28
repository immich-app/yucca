<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import CreateResticModal from "$lib/components/connections/CreateResticModal.svelte";
  import ManageTokensModal from "$lib/components/connections/ManageTokensModal.svelte";
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

  // Restic self-serve is invisible unless the user holds the flag.
  const canRestic = $derived(
    data.user?.features?.["connection-restic"] === true,
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

  const onCreated = (result: ConnectionResticResponseDto) => {
    void invalidateAll();
    modalManager.open(ResticResultModal, {
      url: result.url,
      repositoryName: result.repository.name,
    });
  };

  const openCreate = () => modalManager.open(CreateResticModal, { onCreated });

  const openTokens = (repo: RepositoryWithMetricsDto) =>
    modalManager.open(ManageTokensModal, {
      repositoryId: repo.id,
      repositoryName: repo.name,
    });

  const typeColor = (type: ConnectionDto["type"]) =>
    type === "immich" ? "primary" : "success";
</script>

<svelte:head><title>{$t`Connections`} &middot; FUTO Backups</title></svelte:head
>

<Stack gap={4}>
  <HStack class="justify-between">
    <Heading size="small">{$t`Connections`}</Heading>
    {#if canRestic}
      <Button shape="round" leadingIcon={mdiPlus} onclick={openCreate}
        >{$t`New restic backup`}</Button
      >
    {/if}
  </HStack>

  <Text color="muted"
    >{$t`A connection is a client that backs up this account — an Immich instance or a restic repository.`}</Text
  >

  {#if data.connections.length === 0}
    <Text color="muted">{$t`No connections yet.`}</Text>
  {/if}

  {#each data.connections as connection (connection.id)}
    {@const repos = reposByConnection.get(connection.id) ?? []}
    {@const isRestic = connection.type === "restic"}
    <Card>
      <CardHeader>
        <HStack class="justify-between">
          <HStack gap={2}>
            <CardTitle>{connection.name}</CardTitle>
            <Badge color={typeColor(connection.type)}>{connection.type}</Badge>
          </HStack>
          <Text size="small" color="muted">
            {$t`${connection.repositoryCount} repositories`} ·
            <FormatBytes bytes={connection.billableBytes} />
            {$t`billed`}
          </Text>
        </HStack>
      </CardHeader>
      {#if isRestic && repos.length > 0}
        <CardBody>
          <Stack gap={0} class="divide-y rounded-2xl border overflow-hidden">
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
