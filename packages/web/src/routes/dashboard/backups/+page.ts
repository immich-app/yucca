import type { PageLoad } from '../../$types';
import { getRepositories } from '@futo-org/backups-api-client';

export const load: PageLoad = async ({ fetch }) => {
  return {
    initialData: await getRepositories({ fetch }),
  };
};
