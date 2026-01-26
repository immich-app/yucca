import type { PageLoad } from './$types';
import { auth } from '$lib/utils/auth';

export const load: PageLoad = async () => {
  await auth();
};
