import type { PageLoad } from './$types';
import {
  getDiscordInvite,
  type DiscordInviteResponseDto,
} from '@futo-org/backups-api-client';

export const load: PageLoad = async ({ url, fetch }) => {
  const token = url.searchParams.get('token') ?? '';

  let invite: DiscordInviteResponseDto | null = null;
  if (token) {
    try {
      invite = await getDiscordInvite(token, { fetch });
    } catch (error) {
      if ((error as { status?: number }).status !== 404) {
        throw error;
      }
    }
  }

  return { token, invite };
};
