import type { PageLoad } from '../$types';
import { getRepositories } from 'yucca-sdk';

export const load: PageLoad = async ({ fetch }) => {
  return {
    initialRepositories: await getRepositories({ fetch }).then(
      ({ repositories }) => repositories,
    ),
  };
};
