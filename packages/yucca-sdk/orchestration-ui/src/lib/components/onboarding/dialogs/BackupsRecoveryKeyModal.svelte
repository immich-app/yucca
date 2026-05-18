<script lang="ts">
  import Suspense from "$lib/components/util/Suspense.svelte";
  import { useRecoveryKey } from "$lib/services/onboarding.service";
  import {
    Button,
    HStack,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
  } from "@immich/ui";
  import RecoveryKeyDisplay from "../RecoveryKeyDisplay.svelte";

  type Props = {
    onClose: () => void;
  };

  const { onClose }: Props = $props();

  const query = useRecoveryKey();
</script>

<Modal size="small" title="Recovery key" {onClose} icon={false}>
  <ModalBody>
    <Stack gap={4}>
      <Text size="small" class="text-muted text-left">
        Keep this key somewhere safe. It is required to restore your backups.
      </Text>

      <Suspense {query}>
        {#snippet children({ recoveryKey })}
          <RecoveryKeyDisplay code={recoveryKey} />
        {/snippet}
      </Suspense>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button onclick={onClose}>Close</Button>
    </HStack>
  </ModalFooter>
</Modal>
