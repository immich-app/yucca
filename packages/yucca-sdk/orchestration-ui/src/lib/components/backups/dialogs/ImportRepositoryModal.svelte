<script lang="ts">
  import Suspense from "$lib/components/util/Suspense.svelte";
  import { type LocalRepositoryDto } from "$lib/fetch-client";
  import {
    useCheckImportRepository,
    useImportRepository,
  } from "$lib/services/repository.service";
  import { FormModal, modalManager, Text } from "@immich/ui";
  import ConfigureRepositoryModal from "./ConfigureRepositoryModal.svelte";

  type Props = {
    onClose: () => void;
    repository: LocalRepositoryDto;
  };

  let { onClose, repository }: Props = $props();

  // svelte-ignore state_referenced_locally
  const check = useCheckImportRepository(
    repository.id,
    repository.backends!.primary.id,
  );

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
  disabled={check.data?.readable !== true || mutation.isPending}
  {onSubmit}
  {onClose}
>
  <Suspense query={check}>
    {#if check.data?.readable}
      <Text>Repository is readable and accessible!</Text>
    {:else}
      <Text>Can't read repository.</Text>
    {/if}
  </Suspense>
</FormModal>
