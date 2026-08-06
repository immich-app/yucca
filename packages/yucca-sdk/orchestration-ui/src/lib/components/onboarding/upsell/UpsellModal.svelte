<script lang="ts">
  import {
    CloseButton,
    HStack,
    Modal,
    ModalBody,
    ModalHeader,
  } from "@immich/ui";
  import UpsellHowItWorks from "./UpsellHowItWorks.svelte";
  import UpsellProtectYourImmichLibrary from "./UpsellProtectYourImmichLibrary.svelte";

  type Props = {
    price: string;
    onGetStarted: () => void;
    onLearnMore: () => void;
    onClose: () => void;
  };

  const { price, onGetStarted, onLearnMore, onClose }: Props = $props();
</script>

<Modal
  size="giant"
  {onClose}
  icon={false}
  // this is a bit of a hack to remove the frames from base modal...
  // twin code is in ViewStatusModal
  class="[&>div>div:first-child]:border-b-0 [&>div>div:first-child]:pb-0"
>
  <ModalHeader>
    <HStack fullWidth class="justify-end">
      <CloseButton onclick={onClose} />
    </HStack>
  </ModalHeader>

  <ModalBody>
    <HStack gap={4} class="p-4">
      <UpsellProtectYourImmichLibrary {price} {onGetStarted} {onLearnMore} />

      <UpsellHowItWorks />
    </HStack>
  </ModalBody>
</Modal>
