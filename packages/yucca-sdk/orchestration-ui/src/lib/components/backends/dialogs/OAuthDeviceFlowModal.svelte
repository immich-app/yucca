<script lang="ts">
  import Suspense from "$lib/components/util/Suspense.svelte";
  import type { SocketEvent } from "$lib/events";
  import { type BackendDto } from "$lib/fetch-client";
  import {
    useBackendEventHandler,
    useDeviceFlow,
  } from "$lib/services/backend.service";
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
    toastManager,
    VStack,
  } from "@immich/ui";
  import { mdiContentCopy } from "@mdi/js";
  import OnEvents from "../../util/OnEvents.svelte";

  type Props = {
    onCreate?: (backendId: string) => void;
    onClose: () => void;
  };

  let { onCreate, onClose }: Props = $props();

  const uid = $props.id();
  const query = useDeviceFlow(uid);

  const { onBackendCreate: onBackendCreateHandler } = useBackendEventHandler();

  function onBackendCreate(event: SocketEvent<{ backend: BackendDto }>) {
    onBackendCreateHandler(event);
    onCreate?.(event.data.backend.id);
    onClose();
  }

  function onDeviceFlowFailure() {
    toastManager.danger("Failed to log into FUTO Backups");
    onClose();
  }

  function onRetry() {
    query.refetch();
  }

  function onCopy() {
    navigator.clipboard.writeText(query.data!.userCode);
  }
</script>

<OnEvents {onBackendCreate} {onDeviceFlowFailure} />

<Modal title="Logging into FUTO Backups" icon={false} {onClose}>
  <ModalBody>
    <Suspense {query}>
      <VStack>
        <Text>You may be asked or shown the following code:</Text>
        <Stack direction="row" align="center">
          <Code class="text-3xl select-all">{query.data!.userCode}</Code>
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
    </Suspense>
  </ModalBody>
  <ModalFooter>
    <HStack fullWidth>
      <Button shape="round" color="secondary" fullWidth onclick={onClose}>
        Cancel
      </Button>
      <Button
        shape="round"
        fullWidth
        onclick={onRetry}
        disabled={query.isFetching}>Try again</Button
      >
    </HStack>
  </ModalFooter>
</Modal>
