import { jstsExtractor, svelteExtractor } from 'svelte-i18n-lingui/extractor';

export default {
  locales: ['en', 'en-XA'],
  pseudoLocale: 'en-XA',
  sourceLocale: 'en',
  catalogs: [
    {
      path: 'src/lib/locales/{locale}',
      include: ['src/lib', '../../web/src/lib', '../../web/src/routes'],
    },
  ],
  formatOptions: {
    origins: true,
    lineNumbers: false,
  },
  extractors: [jstsExtractor, svelteExtractor],
};
