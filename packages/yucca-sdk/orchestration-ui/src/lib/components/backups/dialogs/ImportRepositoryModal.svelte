<script lang="ts">
  import { type LocalRepositoryDto } from "$lib/fetch-client";
  import {
    handleCheckImportRepository,
    useImportRepository,
  } from "$lib/services/repository.service";
  import { FormModal, LoadingSpinner, modalManager, Text } from "@immich/ui";
  import { onMount } from "svelte";
  import ConfigureRepositoryModal from "./ConfigureRepositoryModal.svelte";

  interface Props {
    onClose: () => void;
    repository: LocalRepositoryDto;
  }

  let { onClose, repository }: Props = $props();
  let readable: boolean | undefined = $state();

  onMount(async () => {
    const check = await handleCheckImportRepository(
      repository.id,
      repository.backends!.primary.id,
    );

    readable = check.readable;
  });

  const mutation = useImportRepository();

  const onSubmit = () =>
    mutation.mutate(
      { id: repository.id, backendId: repository.backends!.primary.id },
      {
        onSuccess: ({ repository: created }) => {
          onClose();

          modalManager.open(ConfigureRepositoryModal, {
            repository: {
              ...created,
              configuration: created.configuration!,
            },
          });
        },
      },
    );
</script>

<FormModal
  title={`Import ${repository.name}`}
  submitText="Import"
  disabled={readable !== true || mutation.isPending}
  {onSubmit}
  {onClose}
>
  {#if readable === undefined}
    <LoadingSpinner />
  {:else if readable}
    <Text>Repository is readable and accessible!</Text>
  {:else}
    <Text>Can't read repository.</Text>
  {/if}
</FormModal>
