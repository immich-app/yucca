<script lang="ts">
  import { socket } from "$lib/events";
  import {
    MockProvider,
    orchestrationApiProvider,
    setProvider,
  } from "$lib/providers";
  import BackendsList from "../backends/BackendsList.svelte";
  import BackupsList from "../backups/BackupsList.svelte";
  import OnboardingGate from "../onboarding/OnboardingGate.svelte";
  import TasksList from "../tasks/TasksList.svelte";

  const { mock, setMock }: { mock: boolean; setMock(value: boolean): void } =
    $props();

  // svelte-ignore state_referenced_locally
  if (mock) {
    socket.disconnect();
    setProvider(new MockProvider());
  } else {
    socket.connect();
    setProvider(orchestrationApiProvider);
  }
</script>

{#if mock}
  <BackupsList local />
{:else}
  <OnboardingGate onExit={() => setMock(true)}>
    <BackendsList />
    <hr />
    <TasksList />
    <hr />
    <BackupsList local />
  </OnboardingGate>
{/if}
