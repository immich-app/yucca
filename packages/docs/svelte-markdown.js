import { createAttributes, escapeSvelteCode, SvelteMarkdownPreprocess } from '@immich/svelte-markdown-preprocess';

// Upstream escapes only braces and backticks, so `\` and `${` in code would be interpreted by JavaScript.
const escapeTemplateLiteral = (text) => escapeSvelteCode(text.replaceAll('\\', '\\\\')).replaceAll('$', '\\$');

class DocsMarkdownPreprocess extends SvelteMarkdownPreprocess {
  configure(md) {
    return super.configure(md).use({
      renderer: {
        code({ text, lang }) {
          return `<Markdown.Code${createAttributes({ lang })} code={\`${escapeTemplateLiteral(text)}\`} multiline />\n`;
        },
        codespan({ text }) {
          return `<Markdown.Code code={\`${escapeTemplateLiteral(text)}\`} />`;
        },
      },
    });
  }
}

export const docsMarkdownPreprocess = (options) => {
  const plugin = new DocsMarkdownPreprocess(options);
  return { name: plugin.name, markup: (item) => plugin.markup(item) };
};
