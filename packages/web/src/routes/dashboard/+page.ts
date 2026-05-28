import { getRepositories } from '@futo-org/backups-api-client';
import type { PageLoad } from '../$types';

export const load: PageLoad = async ({ fetch }) => {
  return {
    initialData: {
      repositories: await getRepositories({ fetch }),
    },
  };
};
