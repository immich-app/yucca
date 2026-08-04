<script lang="ts">
  import ListToolbar from "$lib/components/ui/ListToolbar.svelte";
  import Pagination from "$lib/components/ui/Pagination.svelte";
  import StackList from "$lib/components/ui/StackList.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import type { LocalRepositoryDto, RunDto } from "$lib/fetch-client";
  import {
    useRunEventHandler,
    useRunHistory,
  } from "$lib/services/runHistory.service";
  import { Stack, type ActionItem } from "@immich/ui";
  import { mdiRadioboxBlank, mdiRadioboxMarked } from "@mdi/js";
  import RepositoryRunHistoryItem from "./RepositoryRunHistoryItem.svelte";

  type Props = {
    repository: LocalRepositoryDto;
    pageSize?: number;
  };

  let { repository, pageSize = 10 }: Props = $props();

  // svelte-ignore state_referenced_locally
  const query = useRunHistory(repository.id);
  const { onRunCreate, onRunUpdate } = useRunEventHandler();

  let search = $state("");
  let newestFirst = $state(true);
  let status = $state<"all" | "complete" | "failed" | "incomplete">("all");
  let page = $state(1);

  const onSearch = (value: string) => {
    search = value;
    page = 1;
  };

  const onFilter = (value: typeof status) => {
    status = value;
    page = 1;
  };

  const sortOptions = [
    { newest: true, title: "Newest first" },
    { newest: false, title: "Oldest first" },
  ];

  const statusOptions: { value: typeof status; title: string }[] = [
    { value: "all", title: "All attempts" },
    { value: "complete", title: "Successful only" },
    { value: "failed", title: "Failed only" },
    { value: "incomplete", title: "In progress only" },
  ];

  const tick = (selected: boolean) =>
    selected ? mdiRadioboxMarked : mdiRadioboxBlank;

  const sort = $derived({
    label: newestFirst ? "Newest first" : "Oldest first",
    items: sortOptions.map(
      (option): ActionItem => ({
        title: option.title,
        icon: tick(newestFirst === option.newest),
        onAction: () => (newestFirst = option.newest),
      }),
    ),
  });

  const filters = $derived({
    label:
      statusOptions.find((option) => option.value === status)?.title ??
      "Filters",
    active: status !== "all",
    items: statusOptions.map(
      (option): ActionItem => ({
        title: option.title,
        icon: tick(status === option.value),
        onAction: () => onFilter(option.value),
      }),
    ),
  });

  const matches = (run: RunDto) => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return true;
    }

    return `${run.type} ${run.status}`.toLowerCase().includes(term);
  };

  const filtered = $derived(
    (query.data ?? [])
      .filter((run) => status === "all" || run.status === status)
      .filter(matches)
      .toSorted((a, b) =>
        newestFirst
          ? +new Date(b.start) - +new Date(a.start)
          : +new Date(a.start) - +new Date(b.start),
      ),
  );

  const pageCount = $derived(Math.max(Math.ceil(filtered.length / pageSize), 1));
  const current = $derived(Math.min(page, pageCount));
  const visible = $derived(
    filtered.slice((current - 1) * pageSize, current * pageSize),
  );
</script>

<OnEvents {onRunCreate} {onRunUpdate} />

<Stack gap={4}>
  <ListToolbar
    placeholder="Search backups"
    {search}
    {onSearch}
    {sort}
    {filters}
  />

  <StackList {query} isEmpty={filtered.length === 0} empty="No backups found">
    {#snippet children()}
      {#each visible as run (run.id)}
        <RepositoryRunHistoryItem {run} />
      {/each}
    {/snippet}
  </StackList>

  <Pagination page={current} {pageCount} onChange={(next) => (page = next)} />
</Stack>
