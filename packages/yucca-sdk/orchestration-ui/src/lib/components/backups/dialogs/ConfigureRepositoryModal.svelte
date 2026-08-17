<script lang="ts">
  import BackendsList from "$lib/components/backends/BackendsList.svelte";
  import PathListField from "$lib/components/ui/PathListField.svelte";
  import { type LocalRepositoryDto } from "$lib/fetch-client";
  import { options } from "$lib/options";
  import {
    useRemoveRepository,
    useUpdateRepository,
  } from "$lib/services/repository.service";
  import {
    Button,
    Field,
    FormModal,
    Input,
    modalManager,
    Stack,
  } from "@immich/ui";
  import { SvelteSet } from "svelte/reactivity";

  type Props = {
    repository: LocalRepositoryDto;
    onClose: () => void;
  };

  let { repository, onClose }: Props = $props();

  // svelte-ignore state_referenced_locally
  let name = $state(repository.name);
  // svelte-ignore state_referenced_locally
  let paths = new SvelteSet(repository.configuration?.paths ?? []);

  const local = $derived(typeof repository.configuration === "object");

  const updateMutation = useUpdateRepository();
  const removeMutation = useRemoveRepository();

  const onSubmit = () =>
    updateMutation.mutate(
      { id: repository.id, dto: { name, paths: [...paths] }, local },
      { onSuccess: () => onClose() },
    );

  const onRemove = async () => {
    const confirm = await modalManager.showDialog({
      confirmText: local ? "Remove" : "Delete",
      title: local ? "Remove Repository" : "Delete Repository",
      prompt: local
        ? "Repository will be removed locally."
        : "This repository will be removed.",
    });

    if (!confirm) return;

    removeMutation.mutate(
      { id: repository.id, local },
      { onSuccess: () => onClose() },
    );
  };

  const { advanced } = options;
</script>

<FormModal
  disabled={name.length === 0 ||
    updateMutation.isPending ||
    removeMutation.isPending}
  title={`Configure ${name}`}
  size="large"
  {onSubmit}
  {onClose}
>
  <Stack gap={4}>
    <Stack gap={2}>
      <Field label="Name">
        <Input bind:value={name} />
      </Field>
    </Stack>

    {#if repository.configuration}
      <PathListField
        {paths}
        addLabel="Add path"
        manageLabel="Add first path"
        pickerTitle="Backup Paths"
        pickerDescription="Select files and folders to include in this backup."
      >
        {#snippet label()}Backup Paths{/snippet}
        {#snippet empty()}No paths configured yet.{/snippet}
      </PathListField>
    {/if}

    <Button color="danger" loading={removeMutation.isPending} onclick={onRemove}
      >Remove Repository from This Device</Button
    >

    {#if advanced}
      <BackendsList {repository} />
    {/if}
  </Stack>
</FormModal>
