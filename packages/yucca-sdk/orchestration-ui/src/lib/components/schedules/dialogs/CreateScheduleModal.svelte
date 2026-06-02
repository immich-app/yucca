<script lang="ts">
  import { useCreateSchedule } from "$lib/services/schedule.service";
  import { Field, FormModal, Input, Stack } from "@immich/ui";
  import validate from "cron-validate";
  import RepositoryPicker from "../RepositoryPicker.svelte";

  type Props = {
    onClose: () => void;
  };

  const { onClose }: Props = $props();

  let name = $state("");
  let cron = $state("*/15 * * * *");
  let repositories = $state<string[]>([]);

  const mutation = useCreateSchedule();

  const onSubmit = () =>
    mutation.mutate(
      { name, cron, repositories },
      { onSuccess: () => onClose() },
    );
</script>

<FormModal
  title="Create A New Schedule"
  size="large"
  disabled={name.length === 0 ||
    validate(cron).isError() ||
    repositories.length === 0 ||
    mutation.isPending}
  {onSubmit}
  {onClose}
>
  <Stack gap={4}>
    <Field label="Name" description="Give this schedule a name">
      <Input bind:value={name} />
    </Field>
    <Field label="Schedule" description="Uses cron syntax">
      <Input bind:value={cron} />
    </Field>

    <RepositoryPicker bind:repositories />
  </Stack>
</FormModal>
