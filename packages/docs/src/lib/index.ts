import {
  mdiCodeBraces,
  mdiConsoleLine,
  mdiRocketLaunchOutline,
  mdiServerNetworkOutline,
  mdiSitemapOutline,
} from '@mdi/js';

export { getEditUrl, Links, siteMetadata } from '$lib/constants';

export type Section = {
  id: string;
  title: string;
  icon: string;
};

export const sections: Section[] = [
  { id: 'getting-started', title: 'Getting started', icon: mdiRocketLaunchOutline },
  { id: 'development', title: 'Development', icon: mdiCodeBraces },
  { id: 'architecture', title: 'Architecture', icon: mdiSitemapOutline },
  { id: 'infrastructure', title: 'Infrastructure', icon: mdiServerNetworkOutline },
  { id: 'operations', title: 'Operations', icon: mdiConsoleLine },
];

export type Heading = {
  id: string;
  text: string;
  level: number;
};

export type DocsPageMeta = {
  title: string;
  description: string;
  order: number;
  url: string;
  sectionId?: string;
  path: string;
  headings: Heading[];
};

export const getSection = (page: DocsPageMeta) => sections.find(({ id }) => id === page.sectionId);

export const getPagesForSection = (pages: DocsPageMeta[], section: Section) =>
  pages.filter((page) => page.sectionId === section.id);

export const getPage = (pages: DocsPageMeta[], url: string | null | undefined) =>
  pages.find((page) => page.url === url);

export const getNeighbours = (pages: DocsPageMeta[], page: DocsPageMeta) => {
  const index = pages.findIndex((item) => item.url === page.url);
  return { previous: pages[index - 1], next: pages[index + 1] };
};
