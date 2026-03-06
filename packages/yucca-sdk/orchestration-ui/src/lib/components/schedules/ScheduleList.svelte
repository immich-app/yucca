<script lang="ts">
  import { getSchedules, type ScheduleDto } from "$lib/fetch-client";
  import { getProvider } from "$lib/providers";
  import { Button, Heading, modalManager } from "@immich/ui";
  import { onMount } from "svelte";
  import CreateScheduleModal from "./dialogs/CreateScheduleModal.svelte";
  import ScheduleItem from "./ScheduleItem.svelte";
  import type { SocketEvent } from "$lib/events";
  import OnEvents from "../util/OnEvents.svelte";

  // svelte-ignore state_referenced_locally
  let schedules: ScheduleDto[] | undefined = $state();
  let repositoryNames: Record<string, string> = $state({});

  const provider = getProvider();

  onMount(() => {
    getSchedules().then((data) => (schedules = data.schedules));

    provider.getRepositories().then((data) => {
      repositoryNames = Object.fromEntries(
        data.repositories.map((r) => [r.id, r.name]),
      );
    });
  });

  const onCreate = () => {
    modalManager.open(CreateScheduleModal, {
      repositories: [],
    });
  };

  const onScheduleCreate = (
    event: SocketEvent<{
      schedule: ScheduleDto;
    }>,
  ) => {
    schedules = [...(schedules ?? []), event.data.schedule];
  };

  const onScheduleUpdate = (
    event: SocketEvent<{
      scheduleId: string;
      schedule: Partial<ScheduleDto>;
    }>,
  ) => {
    schedules = schedules?.map((schedule) =>
      schedule.id === event.data.scheduleId
        ? {
            ...schedule,
            ...event.data.schedule,
          }
        : schedule,
    );
  };

  const onScheduleDelete = (
    event: SocketEvent<{
      scheduleId: string;
    }>,
  ) => {
    schedules = schedules?.filter((s) => s.id !== event.data.scheduleId);
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
  {#each schedules ?? [] as schedule (schedule.id)}
    <ScheduleItem {schedule} {repositoryNames} />
  {/each}
</div>
