import type { LayoutLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const ssr = false;

export const load: LayoutLoad = async ({ parent }) => {
  const { user } = await parent();

  if (!user) {
    redirect(302, '/');
  }
};
