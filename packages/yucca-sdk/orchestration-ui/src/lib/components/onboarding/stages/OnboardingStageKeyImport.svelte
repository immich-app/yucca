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

<Modal size="small" title="Import recovery key" onClose={onCancel}>
  <ModalBody>
    <VStack>
      <Field label="Recovery Key">
        <Input bind:value />
      </Field>
    </VStack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button disabled={!isValidValue()} onclick={onSave}>Save</Button>
      {#if onStart}
        <Button variant="ghost" onclick={onStart}>Back</Button>
      {:else}
        <Button variant="ghost" onclick={onCancel}>Cancel</Button>
      {/if}
    </HStack>
  </ModalFooter>
</Modal>
