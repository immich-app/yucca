<script lang="ts">
  import { useCreateRepository } from "$lib/services/repository.service";
  import {
    Checkbox,
    Field,
    FormModal,
    Input,
    modalManager,
    Stack,
  } from "@immich/ui";
  import ConfigureRepositoryModal from "./ConfigureRepositoryModal.svelte";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    onClose: () => void;
  };

  let { onClose }: Props = $props();

  let name = $state("");
  let worm = $state(false);

  const mutation = useCreateRepository();

  const onSubmit = () =>
    mutation.mutate(
      { name, worm },
      {
        onSuccess: ({ repository }) => {
          onClose();

          modalManager.open(ConfigureRepositoryModal, {
            repository: {
              ...repository,
              configuration: repository.configuration!,
            },
          });
        },
      },
    );
</script>

<FormModal
  title={$t`Create A New Backup`}
  disabled={name.length === 0 || mutation.isPending}
  {onSubmit}
  {onClose}
>
  <Stack gap={4}>
    <Field
      label={$t`Name`}
      description={$t`A memorable name for this backup`}
    >
      <Input bind:value={name} />
    </Field>
    <Field
      label={$t`Write once (WORM)`}
      description={$t`Prevent anything being deleted`}
    >
      <Checkbox bind:checked={worm} />
    </Field>
  </Stack>
</FormModal>
