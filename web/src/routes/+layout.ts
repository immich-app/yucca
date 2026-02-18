import type { LayoutLoad } from './$types';
import { auth } from '$lib/utils/auth';

export const load: LayoutLoad = async ({ fetch }) => {
  const user = await auth(fetch);
  return { user };
};
