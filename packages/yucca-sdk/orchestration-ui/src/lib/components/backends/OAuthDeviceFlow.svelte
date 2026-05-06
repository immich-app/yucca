<script lang="ts">
  import type { SocketEvent } from "$lib/events";
  import type { BackendDto } from "$lib/fetch-client";
  import { useBackendEventHandler } from "$lib/services/backend.service";
  import {
    Button,
    Code,
    HStack,
    IconButton,
    LoadingSpinner,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
    VStack,
  } from "@immich/ui";
  import { mdiContentCopy } from "@mdi/js";
  import OnEvents from "../util/OnEvents.svelte";

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

<Modal title="Logging into FUTO Backups" icon={false} {onClose}>
  <ModalBody>
    <VStack>
      <Text>You may be asked or shown the following code:</Text>
      <Stack direction="row" align="center">
        <Code class="text-3xl select-all">{userCode}</Code>
        <IconButton
          color="secondary"
          variant="outline"
          icon={mdiContentCopy}
          onclick={onCopy}
          aria-label="Copy code"
        />
      </Stack>

      <HStack class="mt-4">
        <LoadingSpinner />
        <Text>Waiting for you to confirm login...</Text>
      </HStack>
    </VStack>
  </ModalBody>
  <ModalFooter>
    <HStack fullWidth>
      <Button shape="round" color="secondary" fullWidth onclick={onClose}>
        Cancel
      </Button>
      <Button shape="round" fullWidth onclick={onOpen}>Open login again</Button>
    </HStack>
  </ModalFooter>
</Modal>
