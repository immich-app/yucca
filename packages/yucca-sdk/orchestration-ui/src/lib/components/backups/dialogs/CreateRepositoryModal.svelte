<script lang="ts">
  import { handleCreateRepository } from "$lib/services/repository.service";
  import {
    Checkbox,
    Field,
    FormModal,
    Input,
    modalManager,
    Stack,
  } from "@immich/ui";
  import ConfigureRepositoryModal from "./ConfigureRepositoryModal.svelte";

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  let name = $state("");
  let worm = $state(false);

  const onSubmit = async () => {
    const { repository } = await handleCreateRepository({ name, worm });

    onClose();

    modalManager.open(ConfigureRepositoryModal, {
      repository: {
        ...repository,
        configuration: repository.configuration!,
      },
    });
  };
</script>

<FormModal
  title="Create A New Backup"
  disabled={name.length === 0}
  {onSubmit}
  {onClose}
>
  <Stack gap={4}>
    <Field label="Name" description="A memorable name for this backup">
      <Input bind:value={name} />
    </Field>
    <Field
      label="Write once (WORM)"
      description="Prevent anything being deleted"
    >
      <Checkbox bind:checked={worm} />
    </Field>
  </Stack>
</FormModal>
