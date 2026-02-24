<script lang="ts">
  import BackendsList from "$lib/components/scraps/BackendsList.svelte";
  import BackupsList from "$lib/components/scraps/BackupsList.svelte";

  import {
    MockProvider,
    orchestrationApiProvider,
    setProvider,
  } from "$lib/providers";
  import Onboarding from "../onboarding/Onboarding.svelte";
  import OnboardingGate from "../onboarding/OnboardingGate.svelte";

  const { mock, setMock }: { mock: boolean; setMock(value: boolean): void } =
    $props();

  // svelte-ignore state_referenced_locally
  if (mock) {
    setProvider(new MockProvider());
  } else {
    setProvider(orchestrationApiProvider);
  }
</script>

{#if mock}
  <BackupsList />
{:else}
  <OnboardingGate onExit={() => setMock(true)}>
    <BackendsList />
    <BackupsList />
  </OnboardingGate>
{/if}
