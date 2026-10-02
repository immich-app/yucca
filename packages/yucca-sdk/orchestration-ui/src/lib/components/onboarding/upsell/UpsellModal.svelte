<script lang="ts">
  import {
    CloseButton,
    HStack,
    Logo,
    Modal,
    ModalBody,
    ModalHeader,
  } from "@immich/ui";
  import UpsellHowItWorks from "./UpsellHowItWorks.svelte";
  import UpsellProtectYourImmichLibrary from "./UpsellProtectYourImmichLibrary.svelte";

  type Props = {
    onGetStarted: () => void;
    onLearnMore: () => void;
    onClose: () => void;
  };

  const { onGetStarted, onLearnMore, onClose }: Props = $props();
</script>

<Modal size="giant" {onClose}>
  <ModalHeader>
    <HStack fullWidth class="justify-between">
      <Logo variant="icon" size="tiny" />
      <CloseButton onclick={onClose} />
    </HStack>
  </ModalHeader>

  <ModalBody>
    <HStack gap={4} class="p-4 max-md:flex-wrap">
      <UpsellProtectYourImmichLibrary {onGetStarted} {onLearnMore} />

      <UpsellHowItWorks />
    </HStack>
  </ModalBody>
</Modal>
