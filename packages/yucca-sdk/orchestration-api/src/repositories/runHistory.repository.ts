import { Injectable } from '@nestjs/common';
import EventIterator from 'event-iterator';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { randomUUID } from 'node:crypto';
import { type WriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { from } from 'rxjs';
import { Tail } from 'tail';
import { TaskStatus } from '../enum';
import { EventsGateway } from '../events/events.gateway';
import { DB } from '../schema';
import { type RunType } from '../schema/tables/runHistory.table';
import { ModuleConfigRepository } from './moduleConfig.repository';
import { StorageRepository } from './storage.repository';

@Injectable()
export class RunHistoryRepository {
  constructor(
    @InjectKysely('orchestrator') private db: Kysely<DB>,
    private readonly moduleConfig: ModuleConfigRepository,
    private readonly storage: StorageRepository,
    private readonly events: EventsGateway,
  ) {}

  private writeError(log: WriteStream, error: unknown) {
    const events = Array.isArray((error as { error?: unknown })?.error)
      ? ((error as { error: unknown[] }).error as object[])
      : [{ message_type: 'error', error: `${error}` }];

    for (const event of events) {
      log.write(JSON.stringify(event) + '\n');
    }
  }

  async createLog(
    repositoryId: string,
    type: RunType,
    fn: (log: WriteStream, logId: string) => Promise<void>,
    callback: (error?: unknown) => unknown,
  ) {
    const logId = randomUUID();

    try {
      const start = new Date().toISOString();
      const logFilePath = resolve(this.moduleConfig.get().statePath, 'logs', repositoryId, start + '.jsonl');

      await this.storage.mkdir(dirname(logFilePath), {
        recursive: true,
      });

      const log = this.storage.createWriteStream(logFilePath);

      const run = await this.db
        .insertInto('runHistory')
        .values({
          id: logId,
          repositoryId,
          type,

          start,
          logFilePath,

          status: TaskStatus.Incomplete,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      this.events.publish({ type: 'RunCreate', run });

      const finalize = async (status: TaskStatus) => {
        const end = new Date().toISOString();
        await this.db.updateTable('runHistory').where('id', '=', logId).set('status', status).set('end', end).execute();

        this.events.publish({
          type: 'RunUpdate',
          runId: logId,
          repositoryId,
          run: { status, end },
        });
      };

      fn(log, logId)
        .then(async () => {
          callback();
          log.close();

          await finalize(TaskStatus.Complete);
        })
        .catch(async (error) => {
          callback(error);

          this.writeError(log, error);
          log.close();

          await finalize(TaskStatus.Failed);
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

      await this.storage.mkdir(dirname(logFilePath), {
        recursive: true,
      });

      const log = this.storage.createWriteStream(logFilePath);

      this.ephemeralLogs.set(logId, logFilePath);

      fn(log, logId)
        .then(() => {
          callback();
          log.close();
        })
        .catch((error) => {
          callback(error);
          this.writeError(log, error);
          log.close();
        });
    } catch (error) {
      callback(error);
    }

    return { logId };
  }

  private ephemeralLogs = new Map<string, string>();

  createLogAsync(repositoryId: string, type: RunType, fn: (log: WriteStream) => Promise<void>) {
    return new Promise<void>(
      (resolve, reject) =>
        void this.createLog(repositoryId, type, fn, (error) => {
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
