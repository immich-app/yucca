<script lang="ts">
  import { CONNECTION_TYPES } from "$lib/components/connections/connection-types";
  import { StackList, StackListItem } from "@futo-org/backups-orchestrator-ui";
  import { type ConnectionDto } from "@futo-org/backups-api-client";
  import { Badge, FormatBytes, Heading, Icon, Stack, Text } from "@immich/ui";
  import { plural, t } from "svelte-i18n-lingui";

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
</script>

<svelte:head><title>{$t`Connections`} &middot; FUTO Backups</title></svelte:head
>

<Stack gap={6}>
  <Stack gap={2}>
    <Heading tag="h1" size="medium">{$t`Connections`}</Heading>

    <Text color="muted"
      >{$t`Connections are the sources of data that back up to us. Right now, that's mostly Immich.`}</Text
    >
  </Stack>

  {#each CONNECTION_TYPES as meta (meta.type)}
    {@const connections = connectionsByType.get(meta.type) ?? []}

    {#if connections.length === 0}
      <Stack gap={2}>
        <Heading tag="h2" size="tiny" class="px-1">{meta.label}</Heading>
        <Text size="small" color="muted" class="px-1">{meta.limitation}</Text>
      </Stack>
    {:else}
      <StackList>
        {#snippet title()}
          {meta.label}
        {/snippet}

        {#each connections as connection (connection.id)}
          <StackListItem title={connection.name}>
            {#snippet icon()}
              <Icon icon={meta.icon} />
            {/snippet}

            {$plural(connection.repositoryCount, {
              one: "# repository",
              other: "# repositories",
            })} &middot;
            <FormatBytes bytes={connection.billableBytes} />
            {$t`billed`}

            {#snippet trailing()}
              <Badge size="small" color="primary">{meta.label}</Badge>
            {/snippet}
          </StackListItem>
        {/each}
      </StackList>
    {/if}
  {/each}
</Stack>
