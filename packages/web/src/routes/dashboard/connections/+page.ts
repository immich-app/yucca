import type { PageLoad } from './$types';
import { getRepositories, listConnections } from '@futo-org/backups-api-client';

export const load: PageLoad = async ({ fetch }) => {
  const [connections, repositories] = await Promise.all([
    listConnections({ fetch }),
    getRepositories({ fetch }),
  ]);
  return {
    connections: connections.connections,
    repositories: repositories.repositories,
  };
};
