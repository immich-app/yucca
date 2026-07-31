<script lang="ts" generics="T">
  import { getReadableErrorMessage } from "$lib/utils/handle-error";
  import {
    Alert,
    Card,
    CardBody,
    Heading,
    HStack,
    LoadingSpinner,
    Stack,
    Text,
  } from "@immich/ui";
  import type { CreateQueryResult } from "@tanstack/svelte-query";
  import type { Snippet } from "svelte";

  type Props = {
    title?: Snippet;
    action?: Snippet;
    query?: CreateQueryResult<T>;
    empty?: string;
    isEmpty?: boolean;
    children?: Snippet<[T]>;
  };

  const {
    title,
    action,
    query,
    empty,
    isEmpty = false,
    children,
  }: Props = $props();
</script>

<Stack gap={2}>
  {#if title || action}
    <HStack class="items-center justify-between px-1">
      {#if title}
        <Heading size="tiny">{@render title()}</Heading>
      {/if}

      {#if action && !isEmpty}
        {@render action()}
      {/if}
    </HStack>
  {/if}

  {#if query?.isLoading}
    <LoadingSpinner />
  {:else if query?.isError}
    <Alert color="danger">{getReadableErrorMessage(query.error)}</Alert>
  {:else}
    <Card class="border-primary-100 shadow-none">
      <CardBody class="divide-y p-0">
        {#if isEmpty && empty}
          <Text class="text-center py-8" color="muted">{empty}</Text>
        {:else}
          {@render children?.(query?.data as T)}
        {/if}
      </CardBody>
    </Card>
  {/if}
</Stack>
