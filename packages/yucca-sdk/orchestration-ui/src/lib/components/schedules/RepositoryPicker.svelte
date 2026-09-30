<script lang="ts">
  import { useRepositories } from "$lib/services/repository.service";
  import { FocusGroup } from "$lib/utils/focus";
  import { IconButton, Stack, Text } from "@immich/ui";
  import { mdiArrowDown, mdiArrowUp, mdiClose, mdiPlus } from "@mdi/js";
  import StackList from "../ui/StackList.svelte";
  import StackListItem from "../ui/StackListItem.svelte";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    repositories: string[];
  };

  let { repositories = $bindable() }: Props = $props();
  const pickerId = $props.id();
  const upButtons = new FocusGroup(`${pickerId}-up`);
  const downButtons = new FocusGroup(`${pickerId}-down`);
  const removeButtons = new FocusGroup(`${pickerId}-remove`);
  const addButtons = new FocusGroup(`${pickerId}-add`);

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
    const moved = repositories[index];
    const next = [...repositories];
    [next[index], next[target]] = [next[target], next[index]];
    repositories = next;

    void (delta < 0
      ? upButtons.focusKey(moved, downButtons)
      : downButtons.focusKey(moved, upButtons));
  };

  const remove = (id: string, index: number) => {
    repositories = repositories.filter((entry) => entry !== id);
    void removeButtons.focusAt(index, addButtons);
  };

  const add = (id: string, index: number) => {
    repositories = [...repositories, id];
    void addButtons.focusAt(index, removeButtons, id);
  };
</script>

<Stack gap={4}>
  <StackList>
    {#snippet title()}{$t`Repositories`}{/snippet}

    {#each repositories as id, index (id)}
      {@const name = nameById[id] ?? id}
      <StackListItem>
        <Text class="grow truncate" size="small">{name}</Text>

        {#snippet trailing()}
          <IconButton
            icon={mdiArrowUp}
            size="tiny"
            variant="ghost"
            aria-label={$t({ message: "Move {name} up", values: { name } })}
            disabled={index === 0}
            {...upButtons.attributes(id)}
            onclick={() => move(index, -1)}
          />
          <IconButton
            icon={mdiArrowDown}
            size="tiny"
            variant="ghost"
            aria-label={$t({ message: "Move {name} down", values: { name } })}
            disabled={index === repositories.length - 1}
            {...downButtons.attributes(id)}
            onclick={() => move(index, 1)}
          />
          <IconButton
            icon={mdiClose}
            size="tiny"
            color="danger"
            variant="ghost"
            aria-label={$t({ message: "Remove {name}", values: { name } })}
            {...removeButtons.attributes(id)}
            onclick={() => remove(id, index)}
          />
        {/snippet}
      </StackListItem>
    {/each}

    {#if repositories.length === 0}
      <StackListItem>
        <Text color="secondary" size="small">
          {$t`No repositories in this schedule yet.`}
        </Text>
      </StackListItem>
    {/if}
  </StackList>

  {#if available.length > 0}
    <StackList>
      {#snippet title()}{$t`Available`}{/snippet}

      {#each available as repo, index (repo.id)}
        <StackListItem>
          <Text class="grow truncate" size="small">{repo.name}</Text>

          {#snippet trailing()}
            <IconButton
              icon={mdiPlus}
              size="tiny"
              variant="ghost"
              aria-label={$t({ message: "Add {name}", values: { name: repo.name } })}
              {...addButtons.attributes()}
              onclick={() => add(repo.id, index)}
            />
          {/snippet}
        </StackListItem>
      {/each}
    </StackList>
  {/if}
</Stack>
