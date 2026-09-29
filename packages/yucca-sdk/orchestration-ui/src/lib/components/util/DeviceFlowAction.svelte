<script lang="ts">
  import type { DeviceFlow } from "$lib/services/deviceFlow.service.svelte";
  import { Button } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    flow: DeviceFlow;
  };

  const { flow }: Props = $props();
</script>

{#if flow.state.opened}
  <Button shape="round" fullWidth onclick={flow.start}>{$t`Try again`}</Button>
{:else}
  <Button
    shape="round"
    fullWidth
    disabled={!flow.state.verificationUri}
    onclick={flow.open}>{$t`Continue to login`}</Button
  >
{/if}
