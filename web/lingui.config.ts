import { jstsExtractor, svelteExtractor } from 'svelte-i18n-lingui/extractor';

export default {
  locales: ['en', 'test'],
  sourceLocale: 'en',
  catalogs: [
    {
      path: 'src/locales/{locale}',
      include: ['src/lib', 'src/routes'],
    },
  ],
  extractors: [jstsExtractor, svelteExtractor],
};
