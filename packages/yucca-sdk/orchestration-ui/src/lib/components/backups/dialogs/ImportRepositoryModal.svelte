<script lang="ts">
  import { type LocalRepositoryDto } from "$lib/fetch-client";
  import {
    handleCheckImportRepository,
    handleImportRepository,
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

  const onSubmit = async () => {
    const { repository: created } = await handleImportRepository(
      repository.id,
      repository.backends!.primary.id,
    );

    onClose();

    modalManager.open(ConfigureRepositoryModal, {
      repository: {
        ...created,
        configuration: created.configuration!,
      },
    });
  };
</script>

<FormModal
  title={`Import ${repository.name}`}
  submitText="Import"
  disabled={readable !== true}
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
