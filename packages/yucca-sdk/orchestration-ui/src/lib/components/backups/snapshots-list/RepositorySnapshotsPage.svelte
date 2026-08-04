<script lang="ts">
  import ListToolbar from "$lib/components/ui/ListToolbar.svelte";
  import Pagination from "$lib/components/ui/Pagination.svelte";
  import StackList from "$lib/components/ui/StackList.svelte";
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import type { LocalRepositoryDto, SnapshotDto } from "$lib/fetch-client";
  import {
    useSnapshotEventHandler,
    useSnapshots,
  } from "$lib/services/snapshot.service";
  import { Stack, type ActionItem } from "@immich/ui";
  import { mdiRadioboxBlank, mdiRadioboxMarked } from "@mdi/js";
  import { DateTime } from "luxon";
  import RepositorySnapshotsListItem from "./RepositorySnapshotsListItem.svelte";

  type Props = {
    repository: LocalRepositoryDto;
    immich?: boolean;
    pageSize?: number;
  };

  let { repository, immich = false, pageSize = 10 }: Props = $props();

  // svelte-ignore state_referenced_locally
  const query = useSnapshots(repository.id);
  const { onRunUpdate } = useSnapshotEventHandler();

  let search = $state("");
  let newestFirst = $state(true);
  let page = $state(1);

  const onSearch = (value: string) => {
    search = value;
    page = 1;
  };

  const sortOptions = [
    { newest: true, title: "Newest first" },
    { newest: false, title: "Oldest first" },
  ];

  const sort = $derived({
    label: newestFirst ? "Newest first" : "Oldest first",
    items: sortOptions.map(
      (option): ActionItem => ({
        title: option.title,
        icon: newestFirst === option.newest
          ? mdiRadioboxMarked
          : mdiRadioboxBlank,
        onAction: () => (newestFirst = option.newest),
      }),
    ),
  });

  const matches = (snapshot: SnapshotDto) => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return true;
    }

    const date = DateTime.fromISO(snapshot.time).toLocaleString(
      DateTime.DATE_FULL,
    );

    return [date, ...snapshot.paths, ...(snapshot.tags ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(term);
  };

  const filtered = $derived(
    (query.data ?? [])
      .filter(matches)
      .toSorted((a, b) =>
        newestFirst
          ? +new Date(b.time) - +new Date(a.time)
          : +new Date(a.time) - +new Date(b.time),
      ),
  );

  const pageCount = $derived(
    Math.max(Math.ceil(filtered.length / pageSize), 1),
  );
  const current = $derived(Math.min(page, pageCount));
  const visible = $derived(
    filtered.slice((current - 1) * pageSize, current * pageSize),
  );
</script>

<OnEvents {onRunUpdate} />

<Stack gap={4}>
  <ListToolbar placeholder="Search snapshots" {search} {onSearch} {sort} />

  <StackList {query} isEmpty={filtered.length === 0} empty="No snapshots found">
    {#snippet children()}
      {#each visible as snapshot (snapshot.id)}
        <RepositorySnapshotsListItem
          repositoryId={repository.id}
          {snapshot}
          {immich}
        />
      {/each}
    {/snippet}
  </StackList>

  <Pagination page={current} {pageCount} onChange={(next) => (page = next)} />
</Stack>
