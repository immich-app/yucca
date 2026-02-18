import { jstsExtractor, svelteExtractor } from 'svelte-i18n-lingui/extractor';

export default {
  locales: ['en', 'ja'],
  sourceLocale: 'en',
  catalogs: [
    {
      path: 'src/locales/{locale}',
      include: ['src/lib', 'src/routes'],
    },
  ],
  formatOptions: {
    origins: true,
    lineNumbers: false,
  },
  extractors: [jstsExtractor, svelteExtractor],
};
