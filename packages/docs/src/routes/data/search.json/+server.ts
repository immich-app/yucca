import { getSection } from '$lib';
import type { SearchDoc } from '$lib/search';
import { pages, type DocsPage } from '$lib/server/docs';
import { json } from '@sveltejs/kit';

export const prerender = true;

const fromPage = (page: DocsPage): SearchDoc => {
  const section = getSection(page);
  return {
    title: page.title,
    description: page.description,
    url: page.url,
    tags: section ? [section.title] : [],
    text: page.text,
  };
};

export const GET = () => json(pages.map((page) => fromPage(page)));
