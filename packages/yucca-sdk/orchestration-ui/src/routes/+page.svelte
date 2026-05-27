<script lang="ts">
  import OnboardingGate from "$lib/components/onboarding/OnboardingGate.svelte";
  import ImmichTestUi from "$lib/components/test/ImmichTestUi.svelte";
  import TestUi from "$lib/components/test/TestUi.svelte";
  import { resetOrchestrator } from "$lib/fetch-client";
  import { options } from "$lib/options";
  import { Button, Checkbox, Heading, HStack, Stack, Text } from "@immich/ui";
  import { onMount } from "svelte";

  let mock: true | false | "immich" = $state(false);

  const { advanced, testUiRestore } = options;

  async function onReset() {
    await resetOrchestrator();
    location.reload();
  }

  onMount(
    () =>
      (mock = JSON.parse(localStorage.getItem("mock") ?? "{}").mock ?? true),
  );

  $effect(() => localStorage.setItem("mock", JSON.stringify({ mock })));
</script>

<div class="p-8 flex items-center justify-between gap-4 bg-gray-100 text-black">
  <Heading size="giant"
    >Orchestrator <img
      alt="Test UI"
      src="/test-ui.png"
      class="inline h-24"
    /></Heading
  >

  <Stack align="end">
    <HStack>
      <Button onclick={() => (mock = true)} disabled={mock === true}
        >Use mock provider</Button
      >
      <Button onclick={() => (mock = false)} disabled={mock === false}
        >Use orchestration API</Button
      >
      <Button onclick={() => (mock = "immich")} disabled={mock === "immich"}
        >Immich</Button
      >
      <Button onclick={onReset} color="warning">Reset</Button>
    </HStack>

    <HStack gap={4}>
      <label class="select-none flex gap-2 items-center">
        <Checkbox bind:checked={$advanced} />
        <Text size="giant">Show advanced options</Text>
      </label>
      <label class="select-none flex gap-2 items-center">
        <Checkbox bind:checked={$testUiRestore} />
        <Text size="giant">Immich restore mode</Text>
      </label>
    </HStack>
  </Stack>
</div>

<hr />

{#if mock === "immich"}
  <ImmichTestUi onExit={() => (mock = true)} />
{:else if mock}
  <TestUi mock={true} />
{:else}
  <OnboardingGate onExit={() => (mock = true)}>
    <TestUi mock={false} />
  </OnboardingGate>
{/if}
