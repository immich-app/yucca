<script lang="ts">
  import { useCreateSchedule } from "$lib/services/schedule.service";
  import { Field, FormModal, HelperText, Input, Stack } from "@immich/ui";
  import validate from "cron-validate";
  import RepositoryPicker from "../RepositoryPicker.svelte";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    onClose: () => void;
  };

  const { onClose }: Props = $props();

  let name = $state("");
  let cron = $state("*/15 * * * *");
  let repositories = $state<string[]>([]);

  const cronInvalid = $derived(validate(cron).isError());

  const mutation = useCreateSchedule();

  const onSubmit = () =>
    mutation.mutate(
      { name, cron, repositories },
      { onSuccess: () => onClose() },
    );
</script>

<FormModal
  title={$t`Create A New Schedule`}
  size="large"
  disabled={name.length === 0 ||
    cronInvalid ||
    repositories.length === 0 ||
    mutation.isPending}
  {onSubmit}
  {onClose}
>
  <Stack gap={4}>
    <Field
      label={$t`Name`}
      description={$t`Give this schedule a name`}
    >
      <Input bind:value={name} />
    </Field>
    <Field
      label={$t`Schedule`}
      description={$t`Uses cron syntax`}
      invalid={cronInvalid}
    >
      <Input bind:value={cron} />
      {#if cronInvalid}
        <HelperText color="danger"
          >{$t`Enter a valid cron expression, for example */15 * * * *`}</HelperText
        >
      {/if}
    </Field>

    <RepositoryPicker bind:repositories />
  </Stack>
</FormModal>
