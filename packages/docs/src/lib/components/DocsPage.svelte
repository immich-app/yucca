<script lang="ts">
  import { page } from '$app/state';
  import { getEditUrl, getPage, getSection, siteMetadata } from '$lib';
  import PageNavigation from '$lib/components/PageNavigation.svelte';
  import TableOfContents from '$lib/components/TableOfContents.svelte';
  import { Breadcrumbs, Heading, Icon, Link, SiteMetadata, Text } from '@immich/ui';
  import { mdiPencilOutline } from '@mdi/js';
  import type { Snippet } from 'svelte';

  type Props = {
    attributes: { title: string; description: string };
    children?: Snippet;
  };

  const { attributes, children }: Props = $props();

  const doc = $derived(getPage(page.data.pages, page.route.id));
  const section = $derived(doc && getSection(doc));
  const breadcrumbs = $derived([
    { title: 'Docs', href: '/' },
    ...(section ? [{ title: section.title }] : []),
    { title: attributes.title },
  ]);
</script>

<SiteMetadata site={siteMetadata} page={{ title: attributes.title, description: attributes.description }} />

<div class="flex gap-12">
  <article class="min-w-0 grow">
    <Breadcrumbs items={breadcrumbs} class="text-muted text-sm" />

    <Heading tag="h1" size="giant" class="mt-4">{attributes.title}</Heading>
    <Text color="muted" size="large" class="mt-2">{attributes.description}</Text>

    <div class="mt-8">
      {@render children?.()}
    </div>

    {#if doc}
      <div class="mt-12 flex items-center gap-1 text-sm">
        <Icon icon={mdiPencilOutline} size="1rem" />
        <Link href={getEditUrl(doc.path)}>Edit this page on GitHub</Link>
      </div>
      <PageNavigation pages={page.data.pages} {doc} />
    {/if}
  </article>

  {#if doc && doc.headings.length > 1}
    <TableOfContents headings={doc.headings} />
  {/if}
</div>
