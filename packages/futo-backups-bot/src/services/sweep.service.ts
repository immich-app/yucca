import { LoggerRepository } from '@common/server/otel';
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { env } from 'src/env';
import { DiscordRepository } from 'src/repositories/discord.repository';
import { TranscriptStorageRepository } from 'src/repositories/transcriptStorage.repository';
import { formatTranscript } from 'src/utils/transcript';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SweepService {
  constructor(
    private readonly logger: LoggerRepository,
    private readonly discord: DiscordRepository,
    private readonly storage: TranscriptStorageRepository,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweep() {
    if (!this.discord.enabled) {
      return;
    }
    if (!this.storage.enabled) {
      this.logger.info('transcript storage is not configured — skipping ticket sweep');
      return;
    }

    const cutoff = Date.now() - env.TICKET_RETENTION_DAYS * DAY_MS;
    const threads = await this.discord.listClosedTicketThreads();

    for (const thread of threads) {
      const archivedAt = thread.archivedAt;
      if (!archivedAt || archivedAt.getTime() > cutoff) {
        continue;
      }

      try {
        const messages = await this.discord.fetchAllMessages(thread);
        const key = `transcripts/${archivedAt.toISOString().slice(0, 10)}-${thread.name}-${thread.id}.txt`;
        await this.storage.put(key, formatTranscript(thread.name, messages));
        await this.discord.deleteThread(thread);
        this.logger.info({ thread: thread.name, key }, 'archived ticket transcript');
      } catch (error) {
        this.logger.error(error, `failed to sweep ticket thread ${thread.name}`);
      }
    }
  }
}
