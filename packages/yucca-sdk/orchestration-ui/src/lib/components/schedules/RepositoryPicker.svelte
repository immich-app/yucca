<script lang="ts">
  import { useRepositories } from "$lib/services/repository.service";
  import { HStack, IconButton, Stack, Text } from "@immich/ui";
  import { mdiArrowDown, mdiArrowUp, mdiClose, mdiPlus } from "@mdi/js";
  import StackList from "../ui/StackList.svelte";

  type Props = {
    repositories: string[];
  };

  let { repositories = $bindable() }: Props = $props();

  const repositoryQuery = useRepositories();

  const nameById = $derived(
    Object.fromEntries(
      (repositoryQuery.data ?? []).map((repo) => [repo.id, repo.name]),
    ),
  );

  const available = $derived(
    (repositoryQuery.data ?? []).filter(
      (repo) => !repositories.includes(repo.id),
    ),
  );

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= repositories.length) return;
    const next = [...repositories];
    [next[index], next[target]] = [next[target], next[index]];
    repositories = next;
  };

  const remove = (id: string) => {
    repositories = repositories.filter((entry) => entry !== id);
  };

  const add = (id: string) => {
    repositories = [...repositories, id];
  };
</script>

<Stack gap={4}>
  <StackList>
    {#snippet title()}Repositories{/snippet}

    {#each repositories as id, index (id)}
      <HStack gap={2} class="px-4 py-3">
        <Text class="grow truncate" size="small">{nameById[id] ?? id}</Text>
        <IconButton
          icon={mdiArrowUp}
          size="tiny"
          variant="ghost"
          aria-label="Move up"
          disabled={index === 0}
          onclick={() => move(index, -1)}
        />
        <IconButton
          icon={mdiArrowDown}
          size="tiny"
          variant="ghost"
          aria-label="Move down"
          disabled={index === repositories.length - 1}
          onclick={() => move(index, 1)}
        />
        <IconButton
          icon={mdiClose}
          size="tiny"
          color="danger"
          variant="ghost"
          aria-label="Remove"
          onclick={() => remove(id)}
        />
      </HStack>
    {/each}

    {#if repositories.length === 0}
      <HStack class="px-4 py-3">
        <Text color="secondary" size="small">
          No repositories in this schedule yet.
        </Text>
      </HStack>
    {/if}
  </StackList>

  {#if available.length > 0}
    <StackList>
      {#snippet title()}Available{/snippet}

      {#each available as repo (repo.id)}
        <HStack gap={2} class="px-4 py-3">
          <Text class="grow truncate" size="small">{repo.name}</Text>
          <IconButton
            icon={mdiPlus}
            size="tiny"
            variant="ghost"
            aria-label="Add"
            onclick={() => add(repo.id)}
          />
        </HStack>
      {/each}
    </StackList>
  {/if}
</Stack>
