<script lang="ts">
  import {
    Button,
    HStack,
    LoadingSpinner,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
  } from "@immich/ui";
  import RecoveryKeyDisplay from "../RecoveryKeyDisplay.svelte";

  type Props = {
    code: string;

    onNext: () => void;
    onCancel: () => void;
  };

  const { code, onNext, onCancel }: Props = $props();
</script>

<Modal size="small" title="Your recovery key" onClose={onCancel} icon={false}>
  <ModalBody>
    <Stack gap={4}>
      <Text size="small" class="text-muted text-left">
        Save this key somewhere safe, it will be used to restore your backups.
      </Text>

      {#if code}
        <RecoveryKeyDisplay {code} />
      {:else}
        <LoadingSpinner />
      {/if}
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button onclick={onNext}>Next</Button>
      <Button variant="ghost" onclick={onCancel}>Cancel</Button>
    </HStack>
  </ModalFooter>
</Modal>
