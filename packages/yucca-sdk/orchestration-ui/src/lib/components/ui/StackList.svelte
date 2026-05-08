<script lang="ts" generics="T">
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import { Alert, Heading, LoadingSpinner, Stack } from "@immich/ui";
  import type { CreateQueryResult } from "@tanstack/svelte-query";
  import type { Snippet } from "svelte";

  type Props = {
    title?: Snippet;
    query?: CreateQueryResult<T>;
    children: Snippet<[T]>;
  };

  const { title, query, children }: Props = $props();
</script>

<Stack gap={2}>
  {#if title}
    <Heading class="px-1" size="tiny">{@render title()}</Heading>
  {/if}

  {#if query?.isLoading}
    <LoadingSpinner />
  {:else if query?.isError}
    <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
  {:else}
    <Stack gap={0} class="divide-y rounded-2xl border overflow-hidden">
      {@render children(query?.data as T)}
    </Stack>
  {/if}
</Stack>
