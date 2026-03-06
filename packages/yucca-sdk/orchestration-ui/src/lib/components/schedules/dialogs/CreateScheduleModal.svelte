<script lang="ts">
  import { createSchedule } from "$lib/fetch-client";
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
    repositories: string[];
  };

  const { onClose, repositories }: Props = $props();

  let creating = $state(false);

  let name = $state("");
  let cron = $state("*/15 * * * *");

  const onCreate = async () => {
    await createSchedule({
      name,
      cron,
      repositories,
    });

    onClose();
  };
</script>

<Modal title="Create A New Schedule" {onClose}>
  <ModalBody>
    <Stack gap={4}>
      <Field label="Name" description="Give this schedule a name">
        <Input bind:value={name} />
      </Field>
      <Field label="Schedule" description="Cron syntax">
        <Input bind:value={cron} />
      </Field>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <Button
      disabled={creating || name.length === 0 || validate(cron).isError()}
      onclick={onCreate}>Create</Button
    >
  </ModalFooter>
</Modal>
