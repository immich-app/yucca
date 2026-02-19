<script lang="ts">
  import BackupsList from "$lib/components/BackupsList.svelte";
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

<KeyFlow />
<BackupsList />
