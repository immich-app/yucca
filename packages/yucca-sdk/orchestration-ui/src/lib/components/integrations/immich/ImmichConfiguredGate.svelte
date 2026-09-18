<script lang="ts">
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import type { LocalRepositoryDto } from "$lib/fetch-client";
  import {
    useImmichBackupStatus,
    useImmichBackupStatusEventHandler,
  } from "$lib/services/immich.integration.service";
  import type { Snippet } from "svelte";

  type Props = {
    children: Snippet<[LocalRepositoryDto]>;
    onUnconfigured: () => void;
  };

  const { children, onUnconfigured }: Props = $props();

  const backup = useImmichBackupStatus();

  const { repository, status } = $derived(backup);

  $effect(() => {
    if (status.kind === "unconfigured") {
      onUnconfigured();
    }
  });
</script>

<OnEvents {...useImmichBackupStatusEventHandler()} />

{#if repository}
  {@render children(repository)}
{/if}
