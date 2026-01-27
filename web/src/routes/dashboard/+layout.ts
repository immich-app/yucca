import type { LayoutLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutLoad = async ({ parent }) => {
  const { isLoggedIn } = await parent();

  if (!isLoggedIn) {
    redirect(302, '/');
  }
};
