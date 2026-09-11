<script lang="ts">
  import OnboardingGate from "$lib/components/onboarding/OnboardingGate.svelte";
  import UpsellModal from "$lib/components/onboarding/upsell/UpsellModal.svelte";
  import ImmichTestUi from "$lib/components/test/ImmichTestUi.svelte";
  import TestUi from "$lib/components/test/TestUi.svelte";
  import { resetOrchestrator } from "$lib/fetch-client";
  import { options } from "$lib/options";
  import {
    Button,
    Checkbox,
    Heading,
    HStack,
    modalManager,
    Stack,
    Text,
  } from "@immich/ui";
  import { onMount } from "svelte";

  let view: "orchestrator" | "immich" = $state("orchestrator");

  const { advanced, testUiRestore } = options;

  const onUpsellModal = () =>
    void modalManager.open(UpsellModal, {
      price: "$1",
      onGetStarted: () => void 0,
      onLearnMore: () => void 0,
    });

  async function onReset() {
    await resetOrchestrator();
    location.reload();
  }

  onMount(
    () =>
      (view =
        JSON.parse(localStorage.getItem("view") ?? "{}").view ?? "orchestrator"),
  );

  $effect(() => localStorage.setItem("view", JSON.stringify({ view })));
</script>

<div class="flex h-dvh flex-col">
  <div
    class="p-8 flex shrink-0 items-center justify-between gap-4 bg-gray-100 text-black"
  >
    <Heading size="giant"
      >Orchestrator <img
        alt="Test UI"
        src="/test-ui.png"
        class="inline h-24"
      /></Heading
    >

    <Stack align="end">
      <HStack>
        <Button
          onclick={() => (view = "orchestrator")}
          disabled={view === "orchestrator"}
          >Use orchestration API</Button
        >
        <Button onclick={() => (view = "immich")} disabled={view === "immich"}
          >Immich</Button
        >
        <Button onclick={onUpsellModal}>Upsell modal</Button>
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

  <div class="min-h-0 grow">
    {#if view === "immich"}
      <ImmichTestUi onExit={() => (view = "orchestrator")} />
    {:else}
      <OnboardingGate onExit={() => (view = "orchestrator")}>
        <TestUi />
      </OnboardingGate>
    {/if}
  </div>
</div>
