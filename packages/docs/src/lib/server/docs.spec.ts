import { sections } from '$lib';
import { getHeadings, getSearchText, pages, parsePage, toMeta } from '$lib/server/docs';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const routes = fileURLToPath(new URL('../../routes', import.meta.url));

const markdownPages = readdirSync(routes, { recursive: true, encoding: 'utf8' })
  .map((entry) => entry.split('/'))
  .filter((parts) => parts.at(-1) === '+page.md')
  .map((parts) => (parts.length === 1 ? '/' : `/${parts.slice(0, -1).join('/')}`));

const withFrontMatter = (body: string, attributes = 'title: Title\ndescription: Description') =>
  `---\n${attributes}\n---\n\n${body}`;

describe('pages', () => {
  test('scans every markdown page in the routes folder', () => {
    expect(markdownPages.length).toBeGreaterThan(0);
    expect(pages).toHaveLength(markdownPages.length);
  });

  test('derives the url from the page folder', () => {
    const urls = pages.map((page) => page.url).toSorted();
    expect(urls).toEqual(markdownPages.toSorted());
  });

  test('starts with the introduction', () => {
    expect(pages[0].url).toBe('/');
    expect(pages[0].sectionId).toBeUndefined();
  });

  test('puts every other page in a known section', () => {
    const ids = sections.map((section) => section.id);
    for (const page of pages.slice(1)) {
      expect(ids, page.url).toContain(page.sectionId);
      expect(page.url, page.url).toMatch(new RegExp(`^/${page.sectionId}/[a-z0-9-]+$`));
    }
  });

  test('parses the front matter of every page', () => {
    for (const page of pages) {
      expect(page.title, page.url).toEqual(expect.any(String));
      expect(page.description, page.url).toEqual(expect.any(String));
      expect(page.description, page.url).not.toMatch(/\.$/);
      expect(page.path, page.url).toMatch(/^src\/routes\/.*\+page\.md$/);
      expect(page.text.length, page.url).toBeGreaterThan(50);
    }
  });

  test('orders pages by section, then order, then title', () => {
    const expected = sections.flatMap((section) =>
      pages
        .filter((page) => page.sectionId === section.id)
        .toSorted((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    );
    expect(pages.slice(1)).toEqual(expected);
  });

  test('has a unique url per page', () => {
    const urls = new Set(pages.map((page) => page.url));
    expect(urls.size).toBe(pages.length);
  });

  test('extracts unique heading anchors per page', () => {
    for (const page of pages) {
      const ids = page.headings.map((heading) => heading.id);
      expect(new Set(ids).size, page.url).toBe(ids.length);
      for (const heading of page.headings) {
        expect(heading.id, `${page.url} ${heading.text}`).toMatch(/^[a-z0-9-]+$/);
        expect([2, 3], page.url).toContain(heading.level);
      }
    }
  });

  test('strips the search text from the page metadata', () => {
    expect(toMeta(pages[0])).not.toHaveProperty('text');
    expect(toMeta(pages[0]).title).toBe(pages[0].title);
  });
});

describe('parsePage', () => {
  test('derives the url and repository path from the module path', () => {
    const page = parsePage('../../routes/getting-started/example/+page.md', withFrontMatter('Body'));
    expect(page.url).toBe('/getting-started/example');
    expect(page.sectionId).toBe('getting-started');
    expect(page.path).toBe('src/routes/getting-started/example/+page.md');
    expect(page.order).toBe(Number.MAX_SAFE_INTEGER);
  });

  test('treats routes/+page.md as the introduction', () => {
    const page = parsePage('../../routes/+page.md', withFrontMatter('Body', 'title: Intro\ndescription: D\norder: 3'));
    expect(page.url).toBe('/');
    expect(page.sectionId).toBeUndefined();
    expect(page.order).toBe(3);
  });

  test('rejects pages outside the section/slug layout', () => {
    expect(() => parsePage('../../routes/too/deep/nested/+page.md', withFrontMatter('Body'))).toThrow(
      'not a valid docs page path',
    );
  });

  test('rejects pages in an unknown section', () => {
    expect(() => parsePage('../../routes/nope/example/+page.md', withFrontMatter('Body'))).toThrow(
      'unknown section - found nope',
    );
  });

  test('rejects pages without a title or description and shows an example', () => {
    expect(() => parsePage('../../routes/development/example/+page.md', withFrontMatter('Body', 'title: T'))).toThrow(
      /missing description\.\n---\ndescription: .*\n---/,
    );
  });
});

describe('getHeadings', () => {
  test('keeps level two and three headings with anchors matching the rendered ids', () => {
    const headings = getHeadings('# Title\n\n## Using `restic`\n\nText\n\n### Sub heading\n\n#### Deep\n');
    expect(headings).toEqual([
      { id: 'using', text: 'Using restic', level: 2 },
      { id: 'sub-heading', text: 'Sub heading', level: 3 },
    ]);
  });
});

describe('getSearchText', () => {
  test('includes lists, tables, code blocks and alerts as plain text', () => {
    const text = getSearchText(
      [
        'Intro paragraph.',
        '',
        '- first item',
        '- second `item`',
        '',
        '| Variable | Purpose |',
        '| --- | --- |',
        '| `WEB_URL` | Links in emails |',
        '',
        '```bash',
        'docker compose up -d',
        '```',
        '',
        '> [!NOTE]',
        '> Take care when exposing ports.',
        '',
        ':::tip Heads up',
        'Admonition body.',
        ':::',
      ].join('\n'),
    );
    for (const expected of [
      'Intro paragraph.',
      'first item',
      'second item',
      'WEB_URL',
      'Links in emails',
      'docker compose up -d',
      'Take care when exposing ports.',
      'Admonition body.',
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toMatch(/[<>|]/);
  });
});
