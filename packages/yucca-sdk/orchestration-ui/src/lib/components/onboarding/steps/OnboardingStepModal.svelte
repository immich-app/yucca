<script lang="ts">
  import { Modal, ModalBody, type ModalSize } from "@immich/ui";
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    size?: ModalSize;
    onClose: () => void;
    children: Snippet;
  };

  const { title, size = "small", onClose, children }: Props = $props();
</script>

<Modal focusOnOpen {title} {size} {onClose}>
  <ModalBody>
    {@render children()}
  </ModalBody>
</Modal>
