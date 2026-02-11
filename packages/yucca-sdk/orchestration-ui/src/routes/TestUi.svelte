<script lang="ts">
  import BackupsList from "$lib/components/BackupsList.svelte";
  import {
    MockProvider,
    orchestrationApiProvider,
    setProvider,
  } from "$lib/providers.js";

  const { mock }: { mock: boolean } = $props();

  if (mock) {
    setProvider(new MockProvider());
  } else {
    setProvider(orchestrationApiProvider);
  }
</script>

<BackupsList />
