import { sections, type DocsPageMeta, type Heading } from '$lib';
import { getIdFromText, markedSvelte } from '@immich/svelte-markdown-preprocess';
import fm from 'front-matter';
import { Marked, Parser, type Token, type Tokens } from 'marked';

export type DocsPage = DocsPageMeta & {
  text: string;
};

type PageFrontMatter = {
  title: string;
  description: string;
  order?: number;
};

const PAGE_PATH = /\/routes\/(?:(?<section>[^/]+)\/(?<slug>[^/]+)\/)?\+page\.md$/;
const REQUIRED_ATTRIBUTES = ['title', 'description'];

const md = new Marked().use(markedSvelte());

const inlineText = (tokens: Token[]): string =>
  tokens
    .map((token) => {
      if ('tokens' in token && token.tokens) {
        return inlineText(token.tokens);
      }

      return 'text' in token ? token.text : '';
    })
    .join('');

const blockText = (tokens: Token[]): string =>
  tokens
    .map((token) => {
      switch (token.type) {
        case 'code': {
          return (token as Tokens.Code).text;
        }
        case 'table': {
          const { header, rows } = token as Tokens.Table;
          return [...header, ...rows.flat()].map((cell) => inlineText(cell.tokens)).join(' ');
        }
        case 'list': {
          return (token as Tokens.List).items.map((item) => blockText(item.tokens)).join(' ');
        }
        case 'html': {
          return /^\s*<script[\s>]/i.test(token.text) ? '' : token.text;
        }
        default: {
          if ('tokens' in token && token.tokens) {
            return blockText(token.tokens);
          }

          return 'text' in token ? token.text : '';
        }
      }
    })
    .join(' ');

export const getSearchText = (body: string) =>
  blockText(md.lexer(body))
    .replaceAll(/<[^>]*>/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();

export const getHeadings = (body: string): Heading[] => {
  const headings: Heading[] = [];
  for (const token of md.lexer(body)) {
    if (token.type !== 'heading') {
      continue;
    }

    const { depth, tokens } = token as Tokens.Heading;
    if (depth < 2 || depth > 3) {
      continue;
    }

    headings.push({
      id: getIdFromText(Parser.parseInline(tokens, md.defaults)),
      text: inlineText(tokens),
      level: depth,
    });
  }

  return headings;
};

const getFrontMatterExample = (missingAttributes: string[]) =>
  [
    '---',
    ...Object.entries({
      title: 'Your page title',
      description: 'A one sentence summary shown under the title and in search results',
    })
      .filter(([key]) => missingAttributes.includes(key))
      .map(([key, value]) => `${key}: ${value}`),
    '---',
  ].join('\n');

export const parsePage = (path: string, content: string): DocsPage => {
  const match = PAGE_PATH.exec(path);
  if (!match?.groups) {
    throw new Error(`${path} is not a valid docs page path - expected routes/<section>/<slug>/+page.md`);
  }

  const { attributes, body } = fm<PageFrontMatter>(content);
  const { section: sectionId, slug } = match.groups;
  const url = sectionId ? `/${sectionId}/${slug}` : '/';

  const missingAttributes = REQUIRED_ATTRIBUTES.filter((attribute) => !Object.hasOwn(attributes, attribute));
  if (missingAttributes.length > 0) {
    throw new Error(`${url} is missing ${missingAttributes.join(', ')}.\n${getFrontMatterExample(missingAttributes)}`);
  }

  if (sectionId && !sections.some(({ id }) => id === sectionId)) {
    throw new Error(
      `${url} is in an unknown section - found ${sectionId}, but expected one of ${sections.map(({ id }) => id).join(', ')}`,
    );
  }

  return {
    title: attributes.title,
    description: attributes.description,
    order: attributes.order ?? Number.MAX_SAFE_INTEGER,
    url,
    sectionId,
    path: path.replace(/^(\.\.\/)+/, 'src/'),
    headings: getHeadings(body),
    text: getSearchText(body),
  };
};

const byOrderThenTitle = (a: DocsPage, b: DocsPage) => a.order - b.order || a.title.localeCompare(b.title);

const getPages = () => {
  const modules = import.meta.glob<{ default: string }>('../../routes/**/+page.md', { query: '?raw', eager: true });
  const pages = Object.entries(modules).map(([path, { default: content }]) => parsePage(path, content));

  const root = pages.find((page) => page.url === '/');
  if (!root) {
    throw new Error('The docs need an introduction page at routes/+page.md');
  }

  return [
    root,
    ...sections.flatMap((section) => pages.filter((page) => page.sectionId === section.id).toSorted(byOrderThenTitle)),
  ];
};

export const pages: DocsPage[] = getPages();

export const toMeta = ({ text: _text, ...meta }: DocsPage): DocsPageMeta => meta;
