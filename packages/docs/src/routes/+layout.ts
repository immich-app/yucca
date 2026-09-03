import { browser } from '$app/environment';
import type { SearchDoc } from '$lib/search';
import type { LayoutLoad } from './$types';

export const prerender = true;

export const load = (async ({ data, fetch }) => {
  if (!browser) {
    return { ...data, docs: [] };
  }

  try {
    const response = await fetch('/data/search.json');
    const docs = (await response.json()) as SearchDoc[];
    return { ...data, docs };
  } catch {
    return { ...data, docs: [] };
  }
}) satisfies LayoutLoad;
