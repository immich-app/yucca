<script lang="ts">
  import OnEvents from "$lib/components/util/OnEvents.svelte";
  import { useImmichBackupSummary } from "./summary";
  import ImmichBackupsNavButton from "./ImmichBackupsNavButton.svelte";

  type Props = {
    active?: boolean;
    href?: string;
    onclick?: () => void;
    class?: string;
  };

  const {
    active = false,
    href = "/backups",
    onclick,
    class: className,
  }: Props = $props();

  const summary = useImmichBackupSummary();
</script>

<OnEvents {...summary.events} />

{#if !summary.isLoading}
  <ImmichBackupsNavButton
    configured={summary.configured}
    {active}
    {href}
    {onclick}
    class={className}
  />
{/if}
