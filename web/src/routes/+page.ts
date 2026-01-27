import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageLoad = async ({ parent }) => {
  const { isLoggedIn } = await parent();

  if (isLoggedIn) {
    redirect(302, '/dashboard');
  }
};
