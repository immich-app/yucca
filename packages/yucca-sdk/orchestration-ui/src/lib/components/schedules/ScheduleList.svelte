<script lang="ts">
  import { useRepositories } from "$lib/services/repository.service";
  import {
    useScheduleEventHandler,
    useSchedules,
  } from "$lib/services/schedule.service";
  import { Button, HStack, modalManager, Stack } from "@immich/ui";
  import StackList from "../ui/StackList.svelte";
  import StackListPlaceholder from "../ui/StackListPlaceholder.svelte";
  import OnEvents from "../util/OnEvents.svelte";
  import Suspense from "../util/Suspense.svelte";
  import CreateScheduleModal from "./dialogs/CreateScheduleModal.svelte";
  import ScheduleItem from "./ScheduleItem.svelte";

  const schedulesQuery = useSchedules();
  const repositoriesQuery = useRepositories();

  const { onScheduleCreate, onScheduleUpdate, onScheduleDelete } =
    useScheduleEventHandler();

  const repositoryNames = $derived(
    Object.fromEntries(
      repositoriesQuery.data?.map((repository) => [
        repository.id,
        repository.name,
      ]) ?? [],
    ),
  );

  const onCreate = () => modalManager.open(CreateScheduleModal, {});
</script>

<OnEvents {onScheduleCreate} {onScheduleUpdate} {onScheduleDelete} />

<Stack gap={2}>
  <StackList>
    {#snippet title()}Schedules{/snippet}

    <Suspense query={schedulesQuery}>
      {#snippet children(schedules)}
        {#each schedules as schedule (schedule.id)}
          <ScheduleItem {schedule} {repositoryNames} />
        {/each}

        {#if schedules.length === 0}
          <StackListPlaceholder>No schedules yet.</StackListPlaceholder>
        {/if}
      {/snippet}
    </Suspense>
  </StackList>

  <HStack>
    <Button shape="round" size="tiny" variant="outline" onclick={onCreate}
      >Create new schedule</Button
    >
  </HStack>
</Stack>
