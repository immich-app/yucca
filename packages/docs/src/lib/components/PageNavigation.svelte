<script lang="ts">
  import { getNeighbours, type DocsPageMeta } from '$lib';
  import { Icon, Text } from '@immich/ui';
  import { mdiChevronLeft, mdiChevronRight } from '@mdi/js';

  type Props = {
    pages: DocsPageMeta[];
    doc: DocsPageMeta;
  };

  const { pages, doc }: Props = $props();

  const { previous, next } = $derived(getNeighbours(pages, doc));
</script>

<nav class="mt-8 grid gap-4 border-t pt-8 sm:grid-cols-2" aria-label="Page navigation">
  {#if previous}
    <a
      href={previous.url}
      class="hover:border-primary hover:text-primary flex items-center gap-2 rounded-xl border p-4 transition-colors"
    >
      <Icon icon={mdiChevronLeft} size="1.5rem" />
      <div class="min-w-0">
        <Text color="muted" size="tiny">Previous</Text>
        <Text fontWeight="semi-bold" class="truncate">{previous.title}</Text>
      </div>
    </a>
  {:else}
    <div></div>
  {/if}
  {#if next}
    <a
      href={next.url}
      class="hover:border-primary hover:text-primary flex items-center justify-end gap-2 rounded-xl border p-4 text-end transition-colors"
    >
      <div class="min-w-0">
        <Text color="muted" size="tiny">Next</Text>
        <Text fontWeight="semi-bold" class="truncate">{next.title}</Text>
      </div>
      <Icon icon={mdiChevronRight} size="1.5rem" />
    </a>
  {/if}
</nav>
