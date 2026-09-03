export const siteMetadata = {
  title: 'FUTO Backups Docs',
  description: 'Documentation for FUTO Backups: getting started, development and architecture.',
};

export const Links = {
  App: 'https://backups.futo.cloud',
  Repository: 'https://github.com/immich-app/yucca',
  Futo: 'https://futo.org',
};

export const getEditUrl = (path: string) => `${Links.Repository}/edit/main/packages/docs/${path}`;
