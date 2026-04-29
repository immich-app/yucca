<script lang="ts">
  import { Button, Modal, ModalBody, ModalFooter } from "@immich/ui";
  import { useBackendEventHandler } from "$lib/services/backend.service";
  import OnEvents from "../util/OnEvents.svelte";
  import type { SocketEvent } from "$lib/events";
  import type { BackendDto } from "$lib/fetch-client";

  interface Props {
    userCode: string;
    verificationUri: string;
    onCreate?: () => void;
    onClose: () => void;
  }

  let { userCode, verificationUri, onCreate, onClose }: Props = $props();

  const { onBackendCreate: onBackendCreateHandler } = useBackendEventHandler();

  function onBackendCreate(event: SocketEvent<{ backend: BackendDto }>) {
    onBackendCreateHandler(event);
    onCreate?.();
    onClose();
  }

  function onOpen() {
    window.open(verificationUri, "_blank");
  }

  function onCopy() {
    navigator.clipboard.writeText(userCode);
  }
</script>

<OnEvents {onBackendCreate} />

<Modal title="Login with FUTO Backups" {onClose}>
  <ModalBody>
    If asked, enter the code <code>{userCode}</code>
  </ModalBody>
  <ModalFooter>
    <Button onclick={onOpen}>Open link again</Button>
    <Button onclick={onCopy}>Copy code</Button>
  </ModalFooter>
</Modal>
