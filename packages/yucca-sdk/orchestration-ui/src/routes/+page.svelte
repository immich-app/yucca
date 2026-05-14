<script>
  import { Button, Checkbox, Heading, HStack, Text } from "@immich/ui";
  import TestUi from "$lib/components/scraps/TestUi.svelte";
  import { options } from "$lib/options";
  import OnboardingGate from "$lib/components/onboarding/OnboardingGate.svelte";
  import { resetOrchestrator } from "$lib/fetch-client";

  let mock = $state(false);

  const { advanced } = options;

  async function onReset() {
    await resetOrchestrator();
    location.reload();
  }
</script>

<div class="p-8 flex flex-col gap-4">
  <Heading size="giant"
    >Orchestrator <img
      alt="Test UI"
      src="/test-ui.png"
      class="inline h-24"
    /></Heading
  >

  <HStack>
    <Button onclick={() => (mock = true)} disabled={mock}
      >Use mock provider</Button
    >
    <Button onclick={() => (mock = false)} disabled={!mock}
      >Use orchestration API</Button
    >
    <Button onclick={onReset} color="warning">Reset</Button>
  </HStack>

  <label class="select-none flex gap-2 items-center">
    <Checkbox bind:checked={$advanced} />
    <Text size="giant">Show advanced options</Text>
  </label>

  <hr />

  {#if mock}
    <TestUi {mock} />
  {:else}
    <OnboardingGate flow="default" onExit={() => (mock = false)}>
      <TestUi {mock} />
    </OnboardingGate>
  {/if}
</div>
