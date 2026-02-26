<script lang="ts">
  import {
    MockProvider,
    orchestrationApiProvider,
    setProvider,
  } from "$lib/providers";
  import BackendsList from "../backends/BackendsList.svelte";
  import BackupsList from "../backups/BackupsList.svelte";
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
  <BackupsList local />
{:else}
  <OnboardingGate onExit={() => setMock(true)}>
    <BackendsList />
    <hr />
    <BackupsList local />
  </OnboardingGate>
{/if}
