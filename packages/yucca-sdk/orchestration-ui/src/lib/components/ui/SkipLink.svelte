<script lang="ts">
  import { Button } from "@immich/ui";
  import { t } from "svelte-i18n-lingui";

  type Props = {
    target: string;
  };

  const { target }: Props = $props();
</script>

<div class="absolute inset-s-2 top-2 z-50 not-focus-within:sr-only">
  <Button
    size="small"
    onclick={() => document.getElementById(target)?.focus()}
  >
    {$t`Skip to content`}
  </Button>
</div>
