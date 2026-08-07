<script lang="ts">
  import { Stack } from "@immich/ui";
  import type { Snippet } from "svelte";
  import MockImmichServerStatus from "./MockImmichServerStatus.svelte";
  import MockImmichStorageSpace from "./MockImmichStorageSpace.svelte";

  type Props = {
    children: Snippet;
  };

  const { children }: Props = $props();
</script>

<Stack gap={4} class="bg-light w-80 shrink-0 rounded-2xl border p-4">
  <MockImmichStorageSpace>
    {@render children()}
  </MockImmichStorageSpace>

  <MockImmichServerStatus />
</Stack>
