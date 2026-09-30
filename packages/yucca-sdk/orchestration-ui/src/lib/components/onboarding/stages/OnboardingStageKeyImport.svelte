<script lang="ts">
  import { handleImportRecoveryKey } from "$lib/services/onboarding.service";
  import {
    Button,
    Field,
    HStack,
    Input,
    Modal,
    ModalBody,
    ModalFooter,
    VStack,
  } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    onImported: (key: string) => void;
    onStart?: () => void;
    onCancel: () => void;
  };

  const { onImported, onStart, onCancel }: Props = $props();

  let value = $state("");

  const strip = (key: string) => {
    return key.replace(/\s/g, "").toLowerCase().trim();
  };

  const isValidValue = () => /^[a-f0-9]{64}$/.test(strip(value));

  const onSave = async () => {
    const recoveryKey = strip(value);

    await handleImportRecoveryKey({ recoveryKey });

    onImported(recoveryKey);
  };
</script>

<Modal size="small" title={$t`Import recovery key`} onClose={onCancel}>
  <ModalBody>
    <VStack>
      <Field label={$t`Recovery Key`}>
        <Input bind:value />
      </Field>
    </VStack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button disabled={!isValidValue()} onclick={onSave}>{$t`Save`}</Button>
      {#if onStart}
        <Button variant="ghost" onclick={onStart}>{$t`Back`}</Button>
      {:else}
        <Button variant="ghost" onclick={onCancel}>{$t`Cancel`}</Button>
      {/if}
    </HStack>
  </ModalFooter>
</Modal>
