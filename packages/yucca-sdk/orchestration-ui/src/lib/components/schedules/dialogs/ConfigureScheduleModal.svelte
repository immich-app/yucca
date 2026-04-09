<script lang="ts">
  import {
    createSchedule,
    updateSchedule,
    type ScheduleDto,
  } from "$lib/fetch-client";
  import {
    Button,
    Field,
    Input,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
  } from "@immich/ui";
  import validate from "cron-validate";

  type Props = {
    onClose: () => void;
    schedule: ScheduleDto;
  };

  const { onClose, schedule }: Props = $props();

  let updating = $state(false);

  // svelte-ignore state_referenced_locally
  let name = $state(schedule.name);
  // svelte-ignore state_referenced_locally
  let cron = $state(schedule.cron);

  const onUpdate = async () => {
    await updateSchedule(schedule.id, {
      name,
      cron,
    });

    onClose();
  };
</script>

<Modal title={`Edit ${schedule.name}`} {onClose}>
  <ModalBody>
    <Stack gap={4}>
      <Field label="Name">
        <Input bind:value={name} />
      </Field>
      <Field label="Schedule" description="Uses cron syntax">
        <Input bind:value={cron} />
      </Field>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <Button
      disabled={updating || name.length === 0 || validate(cron).isError()}
      onclick={onUpdate}>Update</Button
    >
  </ModalFooter>
</Modal>
