import { getBillingStatus } from '@futo-org/backups-api-client';
import type { PageLoad } from '../../$types';

export const load: PageLoad = async ({ url, fetch }) => {
  return {
    initialData: await getBillingStatus(
      url.searchParams.has('customer_session_token'),
      { fetch },
    ),
  };
};
