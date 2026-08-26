<script lang="ts">
  import DeviceFlowAction from "$lib/components/util/DeviceFlowAction.svelte";
  import DeviceFlowCode from "$lib/components/util/DeviceFlowCode.svelte";
  import { createDeviceFlow } from "$lib/services/deviceFlow.service.svelte";
  import { useCreateSession } from "$lib/services/session.service";
  import {
    Button,
    HStack,
    Modal,
    ModalBody,
    ModalFooter,
    Stack,
    Text,
  } from "@immich/ui";
  import { onDestroy } from "svelte";

  type Props = {
    onAuthenticated: () => void;
  };

  const { onAuthenticated }: Props = $props();

  const session = useCreateSession();

  const flow = createDeviceFlow("session", {
    createSession: (token) => session.mutateAsync(token),
    onComplete: () => onAuthenticated(),
  });

  onDestroy(flow.stop);
</script>

<Modal title="Log in to FUTO Backups" icon={false} onClose={() => {}}>
  <ModalBody>
    {#if flow.state.userCode}
      <DeviceFlowCode {flow} />
    {:else}
      <Stack gap={4}>
        <Text>
          This instance is connected to a FUTO Backups account. Log in with that
          account to manage it.
        </Text>

        {#if flow.state.error}
          <Text color="danger">{flow.state.error}</Text>
        {/if}
      </Stack>
    {/if}
  </ModalBody>
  <ModalFooter>
    <HStack fullWidth>
      {#if flow.state.userCode}
        <DeviceFlowAction {flow} />
      {:else}
        <Button
          shape="round"
          fullWidth
          loading={flow.state.pending}
          onclick={flow.start}>Log in with FUTO</Button
        >
      {/if}
    </HStack>
  </ModalFooter>
</Modal>
