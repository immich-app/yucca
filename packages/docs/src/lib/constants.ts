export const siteMetadata = {
  title: 'FUTO Backups Docs',
  description: 'Set up FUTO Backups in Immich or the standalone container, back up your data, and get it back.',
};

export const Links = {
  App: 'https://backups.futo.cloud',
  Repository: 'https://github.com/immich-app/yucca',
  Futo: 'https://futo.org',
};

export const getEditUrl = (path: string) => `${Links.Repository}/edit/main/packages/docs/${path}`;
