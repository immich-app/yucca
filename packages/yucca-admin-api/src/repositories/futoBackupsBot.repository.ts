import { Injectable } from '@nestjs/common';
import { env } from 'src/env';

@Injectable()
export class FutoBackupsBotRepository {
  get enabled(): boolean {
    return Boolean(env.FUTO_BACKUPS_BOT_URL);
  }

  async closeDrop(batchId: string, channelId: string, messageId: string): Promise<void> {
    const response = await fetch(new URL('/internal/drops/close', env.FUTO_BACKUPS_BOT_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': env.INTERNAL_SECRET,
      },
      body: JSON.stringify({ batchId, channelId, messageId }),
    });
    if (!response.ok) {
      throw new Error(`futo-backups-bot POST /internal/drops/close failed: ${response.status} ${response.statusText}`);
    }
  }
}
