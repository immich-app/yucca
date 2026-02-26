<script>
  import { Button, Checkbox, Field, Heading, HStack, Text } from "@immich/ui";
  import TestUi from "$lib/components/scraps/TestUi.svelte";
  import { options } from "$lib/options";

  let mock = $state(false);

  const { advanced } = options;
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

  <label class="select-none flex gap-2 items-center">
    <Checkbox bind:checked={$advanced} />
    <Text size="giant">Show advanced options</Text>
  </label>

  <hr />

  {#key mock}
    <TestUi {mock} setMock={(value) => (mock = value)} />
  {/key}
</div>
