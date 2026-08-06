<script lang="ts" generics="T extends object">
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import { Alert, HStack, LoadingSpinner } from "@immich/ui";
  import type { CreateQueryResult } from "@tanstack/svelte-query";
  import type { Snippet } from "svelte";

  type Props = {
    query: CreateQueryResult<T>;
    children: Snippet<[T]>;
  };

  const { query, children }: Props = $props();
</script>

{#if query.isLoading}
  <HStack class="justify-center p-8">
    <LoadingSpinner />
  </HStack>
{:else if query.isError}
  <div class="p-4">
    <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
  </div>
{:else if query.isSuccess}
  {@render children(query.data)}
{/if}
