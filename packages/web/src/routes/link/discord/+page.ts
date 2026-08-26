import type { PageLoad } from './$types';
import {
  getDiscordLinkRequest,
  type DiscordLinkRequestResponseDto,
} from '@futo-org/backups-api-client';

export const load: PageLoad = async ({ parent, url, fetch }) => {
  const { user } = await parent();
  const code = url.searchParams.get('code') ?? '';

  let request: DiscordLinkRequestResponseDto | null = null;
  if (user && code) {
    try {
      request = await getDiscordLinkRequest(code, { fetch });
    } catch (error) {
      if ((error as { status?: number }).status !== 404) {
        throw error;
      }
    }
  }

  return { code, request };
};
