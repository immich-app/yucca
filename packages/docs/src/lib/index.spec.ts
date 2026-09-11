import { getNeighbours, getPage, getPagesForSection, getSection, sections, type DocsPageMeta } from '$lib';
import { describe, expect, test } from 'vitest';

const meta = (url: string, sectionId?: string): DocsPageMeta => ({
  title: url,
  description: url,
  order: 1,
  url,
  sectionId,
  path: `src/routes${url}/+page.md`,
  headings: [],
});

const pages = [meta('/'), meta('/getting-started/a', 'getting-started'), meta('/development/b', 'development')];

describe('sections', () => {
  test('have unique ids', () => {
    expect(new Set(sections.map((section) => section.id)).size).toBe(sections.length);
  });

  test('resolve from a page', () => {
    expect(getSection(pages[1])?.id).toBe('getting-started');
    expect(getSection(pages[0])).toBeUndefined();
  });
});

describe('pages', () => {
  test('filter by section', () => {
    expect(getPagesForSection(pages, sections[0])).toEqual([pages[1]]);
    expect(getPagesForSection(pages, sections[2])).toEqual([]);
  });

  test('find a page by route id', () => {
    expect(getPage(pages, '/')).toBe(pages[0]);
    expect(getPage(pages, '/nope')).toBeUndefined();
    expect(getPage(pages, null)).toBeUndefined();
  });

  test('link neighbours in reading order', () => {
    expect(getNeighbours(pages, pages[0])).toEqual({ previous: undefined, next: pages[1] });
    expect(getNeighbours(pages, pages[1])).toEqual({ previous: pages[0], next: pages[2] });
    expect(getNeighbours(pages, { ...pages[2] }).next).toBeUndefined();
  });
});
