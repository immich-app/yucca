<script lang="ts">
  import {
    Button,
    Checkbox,
    Field,
    Input,
    Modal,
    ModalBody,
    ModalFooter,
    modalManager,
    Stack,
  } from "@immich/ui";
  import { createRepository } from "$lib/fetch-client";
  import ConfigureRepositoryModal from "./ConfigureRepositoryModal.svelte";

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  let name = $state("");
  let worm = $state(false);
  let creating = $state(false);

  const create = async () => {
    creating = true;

    try {
      const { repository } = await createRepository({
        name,
        worm,
      });

      modalManager.open(ConfigureRepositoryModal, {
        repository: {
          ...repository,
          configuration: repository.configuration!,
        },
      });

      onClose();
    } catch (error) {
      creating = false;
    }
  };
</script>

<Modal title="Create A New Backup" {onClose}>
  <ModalBody>
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
  </ModalBody>
  <ModalFooter>
    <Button disabled={creating || name.length === 0} onclick={create}
      >Create</Button
    >
  </ModalFooter>
</Modal>
