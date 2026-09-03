# docs

The FUTO Backups documentation site, published at https://docs.futo.cloud.

Pages are markdown files under `src/routes`, compiled to Svelte by
[`@immich/svelte-markdown-preprocess`](https://www.npmjs.com/package/@immich/svelte-markdown-preprocess)
and rendered with the `Markdown` components from `@immich/ui`. The site is fully
prerendered (`@sveltejs/adapter-static`) and served by nginx in production.

```bash
mise docs:dev      # http://localhost:36034
mise docs:check    # svelte-check
mise docs:test     # page index unit tests
mise docs:build    # static build into ./build
```

How to add pages, sections, alerts and images is documented on the site itself:
`src/routes/development/writing-docs/+page.md`.
