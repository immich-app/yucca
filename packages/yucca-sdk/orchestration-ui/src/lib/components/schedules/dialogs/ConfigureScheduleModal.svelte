<script lang="ts">
  import type { ScheduleDto } from "$lib/fetch-client";
  import { useUpdateSchedule } from "$lib/services/schedule.service";
  import { Field, FormModal, Input, Stack } from "@immich/ui";
  import validate from "cron-validate";
  import RepositoryPicker from "../RepositoryPicker.svelte";
  import { t } from "svelte-i18n-lingui";

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
  title={$t({ message: "Edit {name}", values: { name: schedule.name } })}
  size="large"
  disabled={name.length === 0 ||
    validate(cron).isError() ||
    repositories.length === 0 ||
    mutation.isPending}
  {onSubmit}
  {onClose}
>
  <Stack gap={4}>
    <Field label={$t`Name`}>
      <Input bind:value={name} />
    </Field>
    <Field label={$t`Schedule`} description={$t`Uses cron syntax`}>
      <Input bind:value={cron} />
    </Field>

    <RepositoryPicker bind:repositories />
  </Stack>
</FormModal>
