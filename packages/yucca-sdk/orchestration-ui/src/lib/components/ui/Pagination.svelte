<script lang="ts">
  import { Button, HStack, IconButton, Text } from "@immich/ui";
  import { mdiChevronLeft, mdiChevronRight } from "@mdi/js";

  type Props = {
    page: number;
    pageCount: number;
    onChange: (page: number) => void;
  };

  const { page, pageCount, onChange }: Props = $props();

  const boundaryCount = 2;
  const siblingCount = 0;

  const range = (from: number, to: number) =>
    Array.from({ length: Math.max(to - from + 1, 0) }, (_, index) => from + index);

  const pages = $derived.by(() => {
    const shown = new Set([
      ...range(1, Math.min(boundaryCount, pageCount)),
      ...range(Math.max(pageCount - boundaryCount + 1, 1), pageCount),
      ...range(
        Math.max(page - siblingCount, 1),
        Math.min(page + siblingCount, pageCount),
      ),
    ]);

    const items: (number | "ellipsis")[] = [];
    for (const candidate of range(1, pageCount)) {
      if (shown.has(candidate)) {
        items.push(candidate);
      } else if (items.at(-1) !== "ellipsis") {
        items.push("ellipsis");
      }
    }

    return items;
  });
</script>

<HStack class="items-center justify-between">
  <IconButton
    icon={mdiChevronLeft}
    aria-label="Previous page"
    variant="ghost"
    color="secondary"
    disabled={page <= 1}
    onclick={() => onChange(page - 1)}
  />

  <HStack gap={1} class="items-center">
    {#each pages as item, index (index)}
      {#if item === "ellipsis"}
        <Text class="w-8 text-center" color="muted">&hellip;</Text>
      {:else}
        <Button
          size="small"
          variant="ghost"
          color="secondary"
          class={item === page ? "bg-subtle" : undefined}
          aria-label={`Page ${item}`}
          aria-current={item === page ? "page" : undefined}
          onclick={() => onChange(item)}
        >
          {item}
        </Button>
      {/if}
    {/each}
  </HStack>

  <IconButton
    icon={mdiChevronRight}
    aria-label="Next page"
    variant="ghost"
    color="secondary"
    disabled={page >= pageCount}
    onclick={() => onChange(page + 1)}
  />
</HStack>
