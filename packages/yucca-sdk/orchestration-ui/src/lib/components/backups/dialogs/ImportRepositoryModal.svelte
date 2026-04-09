<script lang="ts">
  import {
    checkImportRepository,
    importRepository,
    type LocalRepositoryDto,
    type RepositoryCheckImportResponseDto,
  } from "$lib/fetch-client";
  import {
    Button,
    LoadingSpinner,
    Modal,
    ModalBody,
    ModalFooter,
    modalManager,
    toastManager,
  } from "@immich/ui";
  import { onMount } from "svelte";
  import ConfigureRepositoryModal from "./ConfigureRepositoryModal.svelte";

  interface Props {
    onClose: () => void;
    repository: LocalRepositoryDto;
  }

  let { onClose, repository }: Props = $props();
  let importing = $state(false);
  let check: RepositoryCheckImportResponseDto | undefined = $state();

  onMount(() => {
    checkImportRepository(repository.id, repository.backends!.primary.id).then(
      (data) => (check = data),
    );
  });

  const onImport = async () => {
    importing = true;

    try {
      const { repository: created } = await importRepository(
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
    } catch (error) {
      toastManager.danger(`Failed to import backup: ${error}`);
    } finally {
      importing = false;
    }
  };
</script>

<Modal title={`Import ${repository.name}`} {onClose}>
  <ModalBody>
    {#if check}
      {#if check.readable}
        Repository is readable and accessible!
      {:else}
        Can't read repository.
      {/if}
    {:else}
      <LoadingSpinner />
    {/if}
  </ModalBody>
  <ModalFooter>
    <Button disabled={importing || !check?.readable} onclick={onImport}
      >Import</Button
    >
  </ModalFooter>
</Modal>
