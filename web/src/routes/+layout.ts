import type { LayoutLoad } from './$types';
import { auth } from '$lib/utils/auth';

export const load: LayoutLoad = async ({ fetch }) => {
  const isLoggedIn = await auth(fetch);
  return { isLoggedIn };
};
