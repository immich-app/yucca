<script lang="ts">
  import type { Heading } from '$lib';
  import { Text } from '@immich/ui';

  type Props = {
    headings: Heading[];
  };

  const { headings }: Props = $props();
</script>

<aside class="hidden w-56 shrink-0 xl:block" aria-label="On this page">
  <div class="sticky top-24">
    <Text color="muted" size="small" fontWeight="semi-bold" class="uppercase">On this page</Text>
    <ul class="mt-3 flex flex-col gap-2 border-s text-sm">
      {#each headings as heading (heading.id)}
        <li class={heading.level === 3 ? 'ps-6' : 'ps-3'}>
          <a href="#{heading.id}" class="text-muted hover:text-primary block transition-colors">{heading.text}</a>
        </li>
      {/each}
    </ul>
  </div>
</aside>
