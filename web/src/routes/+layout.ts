import type { LayoutLoad } from './$types';
import { auth } from '$lib/utils/auth';

export const load: LayoutLoad = async ({ fetch }) => {
  await auth(fetch);
};
