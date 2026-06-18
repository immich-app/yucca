<script lang="ts">
  import {
    Button,
    HStack,
    Icon,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
  } from "@immich/ui";
  import { useEnableTelemetry } from "$lib/services/onboarding.service";
  import { mdiChartBox, mdiEyeOff } from "@mdi/js";

  type Props = {
    onContinue: () => void;
    onCancel: () => void;
  };

  const { onContinue, onCancel }: Props = $props();

  const mutation = useEnableTelemetry();

  const onConfirm = () => mutation.mutate(undefined, { onSuccess: onContinue });
</script>

<Modal
  size="small"
  title="Telemetry required for closed beta"
  onClose={onCancel}
>
  <ModalBody>
    <Stack>
      <HStack>
        <Icon icon={mdiChartBox} class="shrink-0 place-self-start mt-1" />
        <Text>
          We collect usage and diagnostic data to understand how FUTO Backups is
          used and to find problems.</Text
        >
      </HStack>
      <HStack>
        <Icon icon={mdiEyeOff} class="shrink-0 place-self-start mt-1" />
        <Text>
          Your photos, files, and recovery key are never collected and never
          leave your device unencrypted.</Text
        >
      </HStack>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <Button onclick={onConfirm} loading={mutation.isPending}>Continue</Button>
      <Button
        variant="ghost"
        onclick={onCancel}
        disabled={mutation.isPending}>Cancel</Button
      >
    </HStack>
  </ModalFooter>
</Modal>
