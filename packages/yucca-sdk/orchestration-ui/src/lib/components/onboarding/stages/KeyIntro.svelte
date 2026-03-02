<script lang="ts">
  import TimedButton from "$lib/components/util/TimedButton.svelte";
  import {
    Button,
    HStack,
    Modal,
    ModalBody,
    ModalFooter,
    Text,
    VStack,
  } from "@immich/ui";

  type Props = {
    onNext: () => void;
    onCancel: () => void;
  };

  const { onNext, onCancel }: Props = $props();
</script>

<Modal size="small" title="Keeping your photos private" onClose={onCancel}>
  <ModalBody>
    <VStack>
      <Text class="text-center"
        >You are about to be given a code which you need to put in a safe place.
        It will be used to allow you to access your backups later.</Text
      >

      <Text class="text-center text-red-500"
        >If you lose it, you won't be able to access your photo backup!</Text
      >
    </VStack>
  </ModalBody>
  <ModalFooter>
    <HStack>
      <TimedButton text="Next" onclick={onNext} />
      <Button variant="ghost" onclick={onCancel}>Cancel</Button>
    </HStack>
  </ModalFooter>
</Modal>
