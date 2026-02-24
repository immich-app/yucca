import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { randomUUID } from 'node:crypto';
import { createWriteStream, WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { RunHistoryStatus } from '../enum';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';
import { DB } from '../schema';

@Injectable()
export class RunHistoryRepository {
  constructor(
    @InjectKysely() private db: Kysely<DB>,
    @Inject(ModuleConfigProvider) private readonly moduleConfig: ModuleConfig,
  ) {}

  async createLog(repositoryId: string, callback: (log: WriteStream) => Promise<void>) {
    const id = randomUUID();

    const start = new Date().toISOString();
    const logFilePath = resolve(this.moduleConfig.statePath, 'logs', repositoryId, start + '.jsonl');

    await mkdir(dirname(logFilePath), {
      recursive: true,
    });

    const log = createWriteStream(logFilePath);

    await this.db
      .insertInto('runHistory')
      .values({
        id,
        repositoryId,

        start,
        logFilePath,

        status: RunHistoryStatus.Incomplete,
      })
      .executeTakeFirstOrThrow();

    try {
      await callback(log);

      log.close();

      await this.db
        .updateTable('runHistory')
        .where('id', '=', id)
        .set('status', RunHistoryStatus.Complete)
        .set('end', new Date().toISOString())
        .executeTakeFirstOrThrow();
    } catch (error) {
      log.write(`${error}`);
      log.close();

      await this.db
        .updateTable('runHistory')
        .where('id', '=', id)
        .set('status', RunHistoryStatus.Failed)
        .set('end', new Date().toISOString())
        .executeTakeFirstOrThrow();
    }
  }

  async getAll(repositoryId: string) {
    return this.db.selectFrom('runHistory').selectAll('runHistory').where('repositoryId', '=', repositoryId).execute();
  }
}
