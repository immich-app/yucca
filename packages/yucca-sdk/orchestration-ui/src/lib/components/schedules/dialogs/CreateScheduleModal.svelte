<script lang="ts">
  import { Field, FormModal, Input, Stack } from "@immich/ui";
  import validate from "cron-validate";
  import { handleCreateSchedule } from "$lib/services/schedule.service";

  type Props = {
    onClose: () => void;
    repositories: string[];
  };

  const { onClose, repositories }: Props = $props();

  let name = $state("");
  let cron = $state("*/15 * * * *");

  const onSubmit = async () => {
    await handleCreateSchedule({ name, cron, repositories });
    onClose();
  };
</script>

<FormModal
  title="Create A New Schedule"
  disabled={name.length === 0 || validate(cron).isError()}
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
  </Stack>
</FormModal>
