<script lang="ts">
  import { CONNECTION_TYPES } from "$lib/components/connections/connection-types";
  import { type ConnectionDto } from "@futo-org/backups-api-client";
  import {
    Badge,
    Card,
    CardHeader,
    CardTitle,
    FormatBytes,
    Heading,
    HStack,
    Icon,
    Stack,
    Text,
  } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  const { data } = $props();

  const connectionsByType = $derived.by(() => {
    const map = new Map<string, ConnectionDto[]>();
    for (const connection of data.connections) {
      const list = map.get(connection.type) ?? [];
      list.push(connection);
      map.set(connection.type, list);
    }
    return map;
  });

  const typeColor = (type: string) =>
    type === "immich" ? "primary" : "success";
</script>

<svelte:head><title>{$t`Connections`} &middot; FUTO Backups</title></svelte:head
>

<Stack gap={5}>
  <Heading tag="h1" size="small">{$t`Connections`}</Heading>

  <Text color="muted"
    >{$t`Connections are the sources of data that back up to us. Right now, that's mostly Immich.`}</Text
  >

  {#each CONNECTION_TYPES as meta (meta.type)}
    {@const connections = connectionsByType.get(meta.type) ?? []}
    <Stack gap={2}>
      <HStack gap={2}>
        <Icon icon={meta.icon} />
        <Heading size="tiny">{meta.label}</Heading>
      </HStack>

      {#if connections.length === 0}
        <Text size="small" color="muted">{meta.limitation}</Text>
      {/if}

      {#each connections as connection (connection.id)}
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
        </Card>
      {/each}
    </Stack>
  {/each}
</Stack>
