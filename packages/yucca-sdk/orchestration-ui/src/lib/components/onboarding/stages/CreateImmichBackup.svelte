<script lang="ts">
  import { Checkbox, Field, FormModal, Input, Stack } from "@immich/ui";
  import { handleCreateRepository } from "$lib/services/repository.service";
  import { SvelteSet } from "svelte/reactivity";
  import { useIntegrations } from "$lib/services/integrations.service";

  interface Props {
    onNext: () => void;
    onSkip: () => void;
  }

  let { onNext, onSkip }: Props = $props();

  let name = $state("Immich");
  let worm = $state(false);
  let paths = new SvelteSet([]);

  const query = useIntegrations();

  const onSubmit = async () => {
    const { repository } = await handleCreateRepository({
      name,
      worm,
      paths: [...paths],
    });

    onSkip();
  };
</script>

<FormModal
  title="Configure Your Immich Backup"
  disabled={name.length === 0}
  onClose={onSkip}
  {onSubmit}
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
    {#if query.isSuccess}
      the path: {query.data.immich!.dataPath}
    {/if}
  </Stack>
</FormModal>
