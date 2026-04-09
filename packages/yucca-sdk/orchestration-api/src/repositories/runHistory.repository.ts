import { Injectable } from '@nestjs/common';
import EventIterator from 'event-iterator';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { randomUUID } from 'node:crypto';
import { createWriteStream, WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { from } from 'rxjs';
import { Tail } from 'tail';
import { TaskStatus } from '../enum';
import { DB } from '../schema';
import { ModuleConfigRepository } from './moduleConfig.repository';

@Injectable()
export class RunHistoryRepository {
  constructor(
    @InjectKysely('orchestrator') private db: Kysely<DB>,
    private readonly moduleConfig: ModuleConfigRepository,
  ) {}

  async createLog(
    repositoryId: string,
    fn: (log: WriteStream, logId: string) => Promise<void>,
    callback: (error?: unknown) => void,
  ) {
    const logId = randomUUID();

    try {
      const start = new Date().toISOString();
      const logFilePath = resolve(this.moduleConfig.get().statePath, 'logs', repositoryId, start + '.jsonl');

      await mkdir(dirname(logFilePath), {
        recursive: true,
      });

      const log = createWriteStream(logFilePath);

      await this.db
        .insertInto('runHistory')
        .values({
          id: logId,
          repositoryId,

          start,
          logFilePath,

          status: TaskStatus.Incomplete,
        })
        .executeTakeFirstOrThrow();

      fn(log, logId)
        .then(async () => {
          callback();
          log.close();

          await this.db
            .updateTable('runHistory')
            .where('id', '=', logId)
            .set('status', TaskStatus.Complete)
            .set('end', new Date().toISOString())
            .execute();
        })
        .catch(async (error) => {
          callback(error);

          log.write(JSON.stringify({ message_type: 'error', error: `${error}` }));
          log.close();

          await this.db
            .updateTable('runHistory')
            .where('id', '=', logId)
            .set('status', TaskStatus.Failed)
            .set('end', new Date().toISOString())
            .execute();
        });
    } catch (error) {
      callback(error);
    }

    return { logId };
  }

  async createEphemeralLog(
    fn: (log: WriteStream, logId: string) => Promise<void>,
    callback: (error?: unknown) => void,
  ) {
    const logId = randomUUID();

    try {
      const logFilePath = resolve(this.moduleConfig.get().statePath, 'logs', 'ephemeral', logId + '.jsonl');

      await mkdir(dirname(logFilePath), {
        recursive: true,
      });

      const log = createWriteStream(logFilePath);

      // Store the path so getObservable can find it
      this.ephemeralLogs.set(logId, logFilePath);

      fn(log, logId)
        .then(() => {
          callback();
          log.close();
        })
        .catch((error) => {
          callback(error);
          log.write(JSON.stringify({ message_type: 'error', error: `${error}` }));
          log.close();
        });
    } catch (error) {
      callback(error);
    }

    return { logId };
  }

  private ephemeralLogs = new Map<string, string>();

  createLogAsync(repositoryId: string, fn: (log: WriteStream) => Promise<void>) {
    return new Promise<void>(
      (resolve, reject) =>
        void this.createLog(repositoryId, fn, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        }),
    );
  }

  async get(id: string) {
    return this.db.selectFrom('runHistory').selectAll('runHistory').where('id', '=', id).executeTakeFirstOrThrow();
  }

  async getAll(repositoryId: string) {
    return this.db.selectFrom('runHistory').selectAll('runHistory').where('repositoryId', '=', repositoryId).execute();
  }

  getObservable(id: string) {
    const db = this.db;
    const ephemeralPath = this.ephemeralLogs.get(id);

    return from(
      new EventIterator<MessageEvent>((queue) => {
        let tail: Tail | undefined;

        const startTail = (logFilePath: string) => {
          tail = new Tail(logFilePath, {
            fromBeginning: true,
            nLines: 50,
          });

          tail.on('line', (data) => queue.push({ data } as MessageEvent));
        };

        if (ephemeralPath) {
          startTail(ephemeralPath);
        } else {
          db.selectFrom('runHistory')
            .select('logFilePath')
            .where('id', '=', id)
            .executeTakeFirstOrThrow()
            .then(({ logFilePath }) => startTail(logFilePath))
            .catch(queue.fail);
        }

        return () => {
          tail?.unwatch();
        };
      }),
    );
  }
}
