import type { DocsPageMeta } from '$lib';

declare global {
  namespace App {
    interface PageData {
      pages: DocsPageMeta[];
    }
  }
}
