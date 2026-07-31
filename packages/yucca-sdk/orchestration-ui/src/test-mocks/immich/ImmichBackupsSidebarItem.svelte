<script lang="ts">
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import { useImmichBackupSummary } from "./summary";
  import ImmichBackupsCard from "./ImmichBackupsCard.svelte";

  type Props = {
    href?: string;
    onclick?: () => void;
    class?: string;
  };

  const { href = "/backups", onclick, class: className }: Props = $props();

  const summary = useImmichBackupSummary();
</script>

<OnEvents {...summary.events} />

{#if !summary.isLoading}
  <ImmichBackupsCard
    configured={summary.configured}
    lastBackup={summary.lastBackup}
    failed={summary.failed}
    sizeBytes={summary.sizeBytes}
    {href}
    {onclick}
    class={className}
  />
{/if}
