<script lang="ts">
  import { Button, Heading, modalManager } from "@immich/ui";
  import CreateScheduleModal from "./dialogs/CreateScheduleModal.svelte";
  import ScheduleItem from "./ScheduleItem.svelte";
  import OnEvents from "../util/OnEvents.svelte";
  import {
    useSchedules,
    useScheduleEventHandler,
  } from "$lib/services/schedule.service";
  import { useRepositories } from "$lib/services/repository.service";

  const schedulesQuery = useSchedules();
  const repositoriesQuery = useRepositories();

  const { onScheduleCreate, onScheduleUpdate, onScheduleDelete } =
    useScheduleEventHandler();

  const repositoryNames = $derived(
    Object.fromEntries(
      repositoriesQuery.data?.map((r) => [r.id, r.name]) ?? [],
    ),
  );

  const onCreate = () => {
    modalManager.open(CreateScheduleModal, {
      repositories: [],
    });
  };
</script>

<OnEvents {onScheduleCreate} {onScheduleUpdate} {onScheduleDelete} />

<div class="flex flex-col gap-2">
  <Heading
    >Schedules <div class="inline-block">
      <Button shape="round" size="tiny" variant="outline" onclick={onCreate}
        >Create new schedule</Button
      >
    </div></Heading
  >
  {#each schedulesQuery.data ?? [] as schedule (schedule.id)}
    <ScheduleItem {schedule} {repositoryNames} />
  {/each}
</div>
