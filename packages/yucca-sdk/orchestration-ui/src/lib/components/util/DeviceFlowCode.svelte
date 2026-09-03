<script lang="ts">
  import type { DeviceFlow } from "$lib/services/deviceFlow.service.svelte";
  import { Code, HStack, IconButton, LoadingSpinner, Stack, Text } from "@immich/ui";
  import { mdiContentCopy } from "@mdi/js";

  type Props = {
    flow: DeviceFlow;
  };

  const { flow }: Props = $props();

  function onCopy() {
    navigator.clipboard.writeText(flow.state.userCode!);
  }
</script>

<Stack gap={4}>
  <Text>You may be asked or shown the following code:</Text>
  <Stack direction="row" align="center">
    <Code class="text-3xl select-all">{flow.state.userCode}</Code>
    <IconButton
      color="secondary"
      variant="outline"
      icon={mdiContentCopy}
      onclick={onCopy}
      aria-label="Copy code"
    />
  </Stack>

  {#if flow.state.opened}
    <HStack>
      <LoadingSpinner />
      <Text>Waiting for you to confirm login...</Text>
    </HStack>
  {/if}
</Stack>
