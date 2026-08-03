<script lang="ts">
  import { handleError } from "$lib/utils/handle-error";
  import {
    createRestic,
    type ConnectionResticResponseDto,
  } from "@futo-org/backups-api-client";
  import {
    Field,
    FormModal,
    HStack,
    Input,
    Select,
    Stack,
    Switch,
    Text,
  } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    onClose: () => void;
    onCreated: (result: ConnectionResticResponseDto) => void;
  };
  let { onClose, onCreated }: Props = $props();

  const lifetimeOptions = [
    { value: "30d", label: $t`30 days` },
    { value: "90d", label: $t`90 days` },
    { value: "365d", label: $t`1 year` },
  ];

  let name = $state("");
  let expiresIn = $state("90d");
  let label = $state("");
  let worm = $state(false);
  let pending = $state(false);

  const onSubmit = async () => {
    if (pending) {
      return;
    }
    pending = true;
    try {
      const result = await createRestic({
        name: name.trim() || undefined,
        worm,
        expiresIn,
        label: label.trim() || undefined,
      });
      onCreated(result);
      onClose();
    } catch (error) {
      handleError(error, $t`Failed to create restic backup`);
    } finally {
      pending = false;
    }
  };
</script>

<FormModal
  size="small"
  title={$t`New restic repository`}
  submitText={$t`Create`}
  disabled={pending}
  {onSubmit}
  {onClose}
>
  <Stack gap={4}>
    <Field label={$t`Name`} description={$t`A label for this repository.`}>
      <Input bind:value={name} placeholder={$t`e.g. laptop`} />
    </Field>

    <Field
      label={$t`Access key lifetime`}
      description={$t`How long the URL stays valid (max 1 year). Revoke the key any time to end access sooner.`}
    >
      <Select bind:value={expiresIn} options={lifetimeOptions} />
    </Field>

    <Field
      label={$t`Key label`}
      description={$t`Shown in the access-key list.`}
    >
      <Input bind:value={label} placeholder={$t`e.g. my laptop`} />
    </Field>

    <HStack gap={3}>
      <Switch bind:checked={worm} />
      <Stack gap={0}>
        <Text>{$t`Write-once (WORM)`}</Text>
        <Text size="tiny" color="muted"
          >{$t`Prevent this repository from being deleted or overwritten.`}</Text
        >
      </Stack>
    </HStack>
  </Stack>
</FormModal>
