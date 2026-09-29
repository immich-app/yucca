<script lang="ts">
  import BackendsList from "$lib/components/backends/BackendsList.svelte";
  import PathListField from "$lib/components/ui/PathListField.svelte";
  import { type LocalRepositoryDto } from "$lib/fetch-client";
  import { options } from "$lib/options";
  import {
    useUpdateRepository,
  } from "$lib/services/repository.service";
  import {
    Field,
    FormModal,
    Input,
    Stack,
  } from "@immich/ui";
  import { SvelteSet } from "svelte/reactivity";
  import { t } from "svelte-i18n-lingui";

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

  const onSubmit = () =>
    updateMutation.mutate(
      { id: repository.id, dto: { name, paths: [...paths] }, local },
      { onSuccess: () => onClose() },
    );

  const { advanced } = options;
</script>

<FormModal
  disabled={name.length === 0 ||
    updateMutation.isPending}
  title={$t({ message: "Configure {name}", values: { name } })}
  size="large"
  {onSubmit}
  {onClose}
>
  <Stack gap={4}>
    <Stack gap={2}>
      <Field label={$t`Name`}>
        <Input bind:value={name} />
      </Field>
    </Stack>

    {#if repository.configuration}
      <PathListField
        {paths}
        addLabel={$t`Add path`}
        manageLabel={$t`Add first path`}
        pickerTitle={$t`Backup Paths`}
        pickerDescription={$t`Select files and folders to include in this backup.`}
      >
        {#snippet label()}{$t`Backup Paths`}{/snippet}
        {#snippet empty()}{$t`No paths configured yet.`}{/snippet}
      </PathListField>
    {/if}

    {#if advanced}
      <BackendsList {repository} />
    {/if}
  </Stack>
</FormModal>
