<script>
  import { Button, Heading, HStack } from "@immich/ui";
  import TestUi from "$lib/components/scraps/TestUi.svelte";

  let mock = $state(false);
</script>

<div class="p-8 flex flex-col gap-4">
  <Heading size="giant">Orchestrator Test UI</Heading>

  <HStack>
    <Button onclick={() => (mock = true)} disabled={mock}
      >Use mock provider</Button
    >
    <Button onclick={() => (mock = false)} disabled={!mock}
      >Use orchestration API</Button
    >
  </HStack>

  {#key mock}
    <TestUi {mock} setMock={(value) => (mock = value)} />
  {/key}
</div>
