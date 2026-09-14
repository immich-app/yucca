import { pages, toMeta } from '$lib/server/docs';
import type { LayoutServerLoad } from './$types';

export const load = (() => ({ pages: pages.map((page) => toMeta(page)) })) satisfies LayoutServerLoad;
