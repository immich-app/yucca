<script lang="ts">
  import { Card, CardBody, Heading, HStack, Stack } from "@immich/ui";
  import type { Snippet } from "svelte";

  type Props = {
    title?: Snippet;
    action?: Snippet;
    children?: Snippet;
  };

  const { title, action, children }: Props = $props();
</script>

<Stack gap={2}>
  {#if title || action}
    <HStack class="items-center justify-between px-1">
      {#if title}
        <Heading size="tiny">{@render title()}</Heading>
      {/if}

      {@render action?.()}
    </HStack>
  {/if}

  <Card class="border-primary-100 shadow-none">
    <CardBody class="divide-y p-0">
      {@render children?.()}
    </CardBody>
  </Card>
</Stack>
