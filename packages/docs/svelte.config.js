import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { docsMarkdownPreprocess } from './svelte-markdown.js';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  extensions: ['.svelte', '.md'],
  preprocess: [
    docsMarkdownPreprocess({
      layouts: {
        default: '$lib/components/DocsPage.svelte',
      },
    }),
    vitePreprocess(),
  ],
  kit: {
    adapter: adapter(),
  },
};

export default config;
