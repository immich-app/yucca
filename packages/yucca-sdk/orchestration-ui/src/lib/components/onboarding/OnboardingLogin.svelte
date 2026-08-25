<script lang="ts">
  import DeviceFlowCode from "$lib/components/util/DeviceFlowCode.svelte";
  import { createDeviceFlow } from "$lib/services/deviceFlow.service.svelte";
  import { useCreateSession } from "$lib/services/session.service";
  import { Button, Modal, ModalBody, Text } from "@immich/ui";
  import { onDestroy } from "svelte";
  import OnboardingStepLayout, {
    type OnboardingStepAction,
  } from "./steps/OnboardingStepLayout.svelte";

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

  const actions: OnboardingStepAction[] = $derived([
    {
      label: "Log in with FUTO",
      onClick: flow.start,
      loading: flow.state.pending,
    },
  ]);
</script>

<Modal size="small" title="FUTO Backups" icon={false} onClose={() => {}}>
  <ModalBody>
    {#if flow.state.userCode}
      <DeviceFlowCode userCode={flow.state.userCode}>
        <Text>
          Waiting for you to confirm login
          {#if flow.state.verificationUri}
            at <a
              href={flow.state.verificationUri}
              target="_blank"
              rel="noreferrer">{flow.state.verificationUri}</a
            >
          {/if}
        </Text>
      </DeviceFlowCode>

      <Button
        class="mt-4"
        shape="round"
        color="secondary"
        variant="outline"
        onclick={flow.start}>Start again</Button
      >
    {:else}
      <OnboardingStepLayout
        title="Log in to manage backups"
        description="This instance is connected to a FUTO Backups account. Log in with that account to manage it."
        {actions}
      >
        {#if flow.state.error}
          <Text color="danger" size="small">{flow.state.error}</Text>
        {/if}
      </OnboardingStepLayout>
    {/if}
  </ModalBody>
</Modal>
