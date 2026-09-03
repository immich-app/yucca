---
title: Writing documentation
description: How this documentation site is built and how to add or change a page
order: 99
---

This site is a SvelteKit app in `packages/docs`, published at [docs.futo.cloud](https://docs.futo.cloud). Every page is a markdown file that is compiled to a Svelte component at build time by [@immich/svelte-markdown-preprocess](https://www.npmjs.com/package/@immich/svelte-markdown-preprocess). Markdown elements render as the `Markdown` components from [@immich/ui](https://ui.immich.app), so the pages share the look of the app.

## Running the site

```bash
mise docs:dev      # dev server with hot reload on http://localhost:36034
mise docs:check    # svelte-check
mise docs:test     # unit tests for the page index
mise docs:build    # static build into packages/docs/build
```

`mise check` and `mise build` include the docs, so CI builds the site on every pull request.

## Adding a page

Pages live under `src/routes/<section>/<slug>/+page.md`. The section is the folder name and must be one of the sections declared in `src/lib/index.ts`; the slug becomes the URL. The introduction is the one exception and lives at `src/routes/+page.md`.

Every page starts with front matter:

```markdown
---
title: Feature flags
description: Per-user product gating, and why the set of flags is code.
order: 2
---
```

| Field         | Required | Purpose                                                              |
| ------------- | -------- | -------------------------------------------------------------------- |
| `title`       | yes      | Page heading, sidebar entry and browser title.                       |
| `description` | yes      | One sentence, no trailing period; shown under the title and in search |
| `order`       | no       | Position within the section. Pages without one sort last, by title. |

Do not repeat the title as an `# H1` in the body; the layout renders it. Start the body with paragraphs or `##` headings. Level two and three headings appear in the table of contents and get anchor ids derived from their text, so keep inline code out of headings.

The build fails when a page is missing a required field or sits in an unknown section, and the unit tests in `src/lib/index.spec.ts` check that every markdown file is picked up.

## Adding a section

Add an entry to `sections` in `src/lib/index.ts` with an id (the folder name), a title and an icon from `@mdi/js`. Sections appear in the sidebar in the order they are declared.

## Markdown features

Standard [GitHub flavored markdown](https://github.github.com/gfm/) works: headings, lists, tables, task lists, links, images, emphasis, inline code and fenced code blocks with syntax highlighting.

### Alerts

GitHub alerts are supported, as is a `:::` admonition block with an optional custom title:

```markdown
> [!TIP]
> Helpful advice for doing things better.

:::warning Heads up
Content that spans multiple paragraphs.
:::
```

> [!TIP]
> Helpful advice for doing things better.

:::warning Heads up
Content that spans multiple paragraphs.
:::

The variants are `note`, `tip`, `important`, `warning`, `caution`, `info`, `success` and `danger`.

### Images

Reference images with a relative path and they are bundled with the page:

```markdown
![The dashboard after the first backup](./dashboard.webp)
```

Keep images next to the page that uses them. Prefer `webp` for screenshots.

### Svelte in markdown

A page can use Svelte components, which is handy for interactive examples. Import them in a `<script>` block placed at the very top of the file, right after the front matter, then use them in the body like HTML:

```markdown
<Button>Click me</Button>
```

The whole page is compiled as one Svelte component, so a `<script>` block anywhere else is hoisted to the top and the markdown before it is lost.

Because the page is compiled as Svelte, curly braces and tag-like text such as `<name>` have meaning in prose and break the build. Put such text in inline code, which needs no escaping; there is no escape sequence for a literal brace outside of code. A lone `<` followed by a space, as in `1 < 2`, is fine.

## Previews and deployment

The Docs workflow publishes the site to Cloudflare Pages. Every pull request that touches the documentation gets its own preview at `docs.pr-<number>.dev.futo.cloud`, linked from a comment on the pull request and removed when it closes; merging to `main` deploys [docs.futo.cloud](https://docs.futo.cloud). The Pages project and its domains are Terraform under `tf/pages/docs`, and `mise docs:deploy` and `mise docs:destroy` are the tasks behind the workflow.

## Search

The build writes `/data/search.json` with the plain text of every page. The command palette (press <kbd>Ctrl</kbd> + <kbd>K</kbd>) searches it, so there is nothing to configure when adding a page.
