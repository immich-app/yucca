<script lang="ts">
  import TimedButton from "$lib/components/util/TimedButton.svelte";
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
  import { mdiKey, mdiSecurity } from "@mdi/js";

  type Props = {
    onNext: () => void;
    onCancel: () => void;
  };

  const { onNext, onCancel }: Props = $props();
</script>

<Modal
  size="small"
  title="Keeping your photos private"
  onClose={onCancel}
  icon={false}
>
  <ModalBody>
    <Stack>
      <HStack>
        <Icon icon={mdiKey} class="shrink-0 place-self-start mt-1" />
        <Text
          >You are about to be given a code which you need to put in a safe
          place.</Text
        >
      </HStack>
      <HStack>
        <Icon icon={mdiSecurity} class="shrink-0 place-self-start mt-1" />
        <Text>If you lose the key, your backup is gone.</Text>
      </HStack>
    </Stack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <TimedButton text="Next" onclick={onNext} />
      <Button variant="ghost" onclick={onCancel}>Cancel</Button>
    </HStack>
  </ModalFooter>
</Modal>
