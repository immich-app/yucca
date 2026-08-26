<script lang="ts">
  import DeviceFlowAction from "$lib/components/util/DeviceFlowAction.svelte";
  import DeviceFlowCode from "$lib/components/util/DeviceFlowCode.svelte";
  import type { SocketEvent } from "$lib/events";
  import { type BackendDto } from "$lib/fetch-client";
  import { useBackendEventHandler } from "$lib/services/backend.service";
  import { createDeviceFlow } from "$lib/services/deviceFlow.service.svelte";
  import { useCreateSession } from "$lib/services/session.service";
  import {
    Button,
    HStack,
    LoadingSpinner,
    Modal,
    ModalBody,
    ModalFooter,
    Text,
  } from "@immich/ui";
  import { onDestroy } from "svelte";
  import OnEvents from "../../util/OnEvents.svelte";

  type Props = {
    onCreate?: (backendId: string) => void;
    onClose: () => void;
  };

  let { onCreate, onClose }: Props = $props();

  const { onBackendCreate: onBackendCreateHandler } = useBackendEventHandler();

  const session = useCreateSession();

  const flow = createDeviceFlow("oidc", {
    createSession: (token) => session.mutateAsync(token),
    onComplete: (event) => {
      if (event.backendId) {
        onCreate?.(event.backendId);
      }

      onClose();
    },
  });

  flow.start();
  onDestroy(flow.stop);

  function onBackendCreate(event: SocketEvent<{ backend: BackendDto }>) {
    onBackendCreateHandler(event);
  }
</script>

<OnEvents {onBackendCreate} />

<Modal title="Logging into FUTO Backups" icon={false} {onClose}>
  <ModalBody>
    {#if flow.state.userCode}
      <DeviceFlowCode {flow} />
    {:else if flow.state.error}
      <Text color="danger">{flow.state.error}</Text>
    {:else}
      <LoadingSpinner />
    {/if}
  </ModalBody>
  <ModalFooter>
    <HStack fullWidth>
      <Button shape="round" color="secondary" fullWidth onclick={onClose}>
        Cancel
      </Button>
      <DeviceFlowAction {flow} />
    </HStack>
  </ModalFooter>
</Modal>
