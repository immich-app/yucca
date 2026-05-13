<script lang="ts">
  import type { ScheduleDto } from "$lib/fetch-client";
  import { Field, FormModal, Input, Stack } from "@immich/ui";
  import validate from "cron-validate";
  import { handleUpdateSchedule } from "$lib/services/schedule.service";
  import RepositoryPicker from "../RepositoryPicker.svelte";

  type Props = {
    onClose: () => void;
    schedule: ScheduleDto;
  };

  const { onClose, schedule }: Props = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(schedule.name);
  // svelte-ignore state_referenced_locally
  let cron = $state(schedule.cron);
  // svelte-ignore state_referenced_locally
  let repositories = $state([...schedule.repositories]);

  const onSubmit = async () => {
    await handleUpdateSchedule(schedule.id, { name, cron, repositories });
    onClose();
  };
</script>

<FormModal
  title={`Edit ${schedule.name}`}
  size="large"
  disabled={name.length === 0 || validate(cron).isError()}
  {onSubmit}
  {onClose}
>
  <Stack gap={4}>
    <Field label="Name">
      <Input bind:value={name} />
    </Field>
    <Field label="Schedule" description="Uses cron syntax">
      <Input bind:value={cron} />
    </Field>

    <RepositoryPicker bind:repositories />
  </Stack>
</FormModal>
