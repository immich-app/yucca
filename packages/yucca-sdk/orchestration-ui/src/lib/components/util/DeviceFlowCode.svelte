<script lang="ts">
  import { Code, HStack, IconButton, LoadingSpinner, Stack, Text } from "@immich/ui";
  import { mdiContentCopy } from "@mdi/js";
  import type { Snippet } from "svelte";

  type Props = {
    userCode: string;
    children?: Snippet;
  };

  const { userCode, children }: Props = $props();

  function onCopy() {
    navigator.clipboard.writeText(userCode);
  }
</script>

<Stack gap={4}>
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

  <HStack>
    <LoadingSpinner />
    {#if children}
      {@render children()}
    {:else}
      <Text>Waiting for you to confirm login...</Text>
    {/if}
  </HStack>
</Stack>
