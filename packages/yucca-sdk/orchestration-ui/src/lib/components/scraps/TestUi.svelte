<script lang="ts">
  import BackendsList from "$lib/components/scraps/BackendsList.svelte";
  import BackupsList from "$lib/components/scraps/BackupsList.svelte";
  import KeyFlow from "$lib/components/key-flow/KeyFlow.svelte";
  import {
    MockProvider,
    orchestrationApiProvider,
    setProvider,
  } from "$lib/providers";

  const { mock }: { mock: boolean } = $props();

  // svelte-ignore state_referenced_locally
  if (mock) {
    setProvider(new MockProvider());
  } else {
    setProvider(orchestrationApiProvider);
  }
</script>

<div>
  <KeyFlow />
</div>

<BackendsList />
<BackupsList />
