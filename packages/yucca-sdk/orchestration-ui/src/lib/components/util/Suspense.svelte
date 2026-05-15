<script lang="ts" generics="T extends object">
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import { Alert, LoadingSpinner } from "@immich/ui";
  import type { CreateQueryResult } from "@tanstack/svelte-query";
  import type { Snippet } from "svelte";

  type Props = {
    query: CreateQueryResult<T>;
    children: Snippet<[T]>;
  };

  const { query, children }: Props = $props();
</script>

{#if query.isLoading}
  <LoadingSpinner />
{:else if query.isError}
  <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
{:else if query.isSuccess}
  {@render children(query.data)}
{/if}
