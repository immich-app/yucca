<script lang="ts">
  import type { ScheduleDto } from "$lib/fetch-client";
  import { useUpdateSchedule } from "$lib/services/schedule.service";
  import { Field, FormModal, Input, Stack } from "@immich/ui";
  import validate from "cron-validate";
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

  const mutation = useUpdateSchedule();

  const onSubmit = () =>
    mutation.mutate(
      { id: schedule.id, dto: { name, cron, repositories } },
      { onSuccess: () => onClose() },
    );
</script>

<FormModal
  title={`Edit ${schedule.name}`}
  size="large"
  disabled={name.length === 0 ||
    validate(cron).isError() ||
    repositories.length === 0 ||
    mutation.isPending}
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
