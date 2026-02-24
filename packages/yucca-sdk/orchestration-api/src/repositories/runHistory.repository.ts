import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { randomUUID } from 'node:crypto';
import { createWriteStream, WriteStream } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
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
    const logPath = resolve(this.moduleConfig.statePath, 'logs', repositoryId, start);

    await mkdir(dirname(logPath), {
      recursive: true,
    });

    const log = createWriteStream(`${logPath}.incomplete.txt`);

    await this.db
      .insertInto('runHistory')
      .values({
        id,
        repositoryId,

        start,
        logFilePath: `${logPath}.incomplete.txt`,

        status: 'incomplete',
      })
      .executeTakeFirstOrThrow();

    try {
      await callback(log);

      log.close();

      await rename(`${logPath}.incomplete.txt`, `${logPath}.txt`);

      await this.db
        .updateTable('runHistory')
        .where('id', '=', id)
        .set('logFilePath', `${logPath}.txt`)
        .set('status', 'complete')
        .set('end', new Date().toISOString())
        .executeTakeFirstOrThrow();
    } catch (error) {
      log.write(`${error}`);
      log.close();

      await rename(`${logPath}.incomplete.txt`, `${logPath}.failed.txt`);

      await this.db
        .updateTable('runHistory')
        .where('id', '=', id)
        .set('logFilePath', `${logPath}.failed.txt`)
        .set('status', 'failed')
        .set('end', new Date().toISOString())
        .executeTakeFirstOrThrow();
    }
  }
}
