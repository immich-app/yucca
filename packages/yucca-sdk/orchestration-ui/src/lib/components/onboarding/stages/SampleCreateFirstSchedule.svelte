<script lang="ts">
  import { Field, FormModal, Input, Stack } from "@immich/ui";
  import validate from "cron-validate";
  import { handleCreateSchedule } from "$lib/services/schedule.service";
  import { useRepositories } from "$lib/services/repository.service";

  type Props = {
    onFinish: () => void;
    onSkip: () => void;
  };

  const { onFinish, onSkip }: Props = $props();

  const query = useRepositories();
  const repositories = $derived(
    (query.data ?? []).filter((repository) => repository.configuration),
  );

  let name = $state("");
  let cron = $state("*/15 * * * *");

  const onSubmit = async () => {
    await handleCreateSchedule({
      name,
      cron,
      repositories: repositories.map((repository) => repository.id),
    });
    onFinish();
  };
</script>

<FormModal
  title="Create First Schedule"
  disabled={name.length === 0 || validate(cron).isError()}
  onClose={onSkip}
  {onSubmit}
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
