import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Database from 'better-sqlite3';
import { SqliteDialect } from 'kysely';
import { KyselyModule } from 'nestjs-kysely';
import { copyFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModuleConfigProvider } from 'src/moduleConfig';
import { openStateDatabase } from 'src/orchestrationApi.module';
import { ConfigRepository } from 'src/repositories/config.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { StorageRepository } from 'src/repositories/storage.repository';

interface Boot {
  config: ConfigRepository;
  database: InstanceType<typeof Database>;
  close: () => Promise<void>;
}

async function boot(statePath: string): Promise<Boot> {
  const database = new Database(join(statePath, 'state.sqlite3'));

  const moduleFixture = await Test.createTestingModule({
    imports: [KyselyModule.forRoot([{ namespace: 'orchestrator', dialect: new SqliteDialect({ database }) }])],
    providers: [
      { provide: ModuleConfigProvider, useValue: { statePath } },
      LoggingRepository,
      StorageRepository,
      DatabaseRepository,
      ConfigRepository,
    ],
  }).compile();

  await moduleFixture.get(DatabaseRepository).runMigrations();

  return {
    config: moduleFixture.get(ConfigRepository),
    database,
    close: async () => {
      await moduleFixture.close();
      if (database.open) {
        database.close();
      }
    },
  };
}

function messages(spy: jest.SpyInstance): string[] {
  return spy.mock.calls.map(([message]) => String(message));
}

let statePath: string;
let warn: jest.SpyInstance;
let log: jest.SpyInstance;

beforeEach(async () => {
  statePath = await mkdtemp(join(tmpdir(), 'yucca-state-'));
  warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('State location', () => {
  it('announces that a new state database is being created, then that it is reopened', () => {
    const first = openStateDatabase({ statePath });
    first.close();

    expect(messages(warn).join('\n')).toContain(join(statePath, 'state.sqlite3'));
    expect(messages(warn).join('\n')).toMatch(/creating a new one/i);

    warn.mockClear();
    const second = openStateDatabase({ statePath });
    second.close();

    expect(warn).not.toHaveBeenCalled();
    expect(messages(log).join('\n')).toMatch(/opened existing state database/i);
  });

  it('warns loudly when it generates a master encryption key', async () => {
    const first = await boot(statePath);
    await first.config.bootstrap();
    const key = await first.config.getMasterEncryptionKey();
    await first.close();

    expect(messages(warn).join('\n')).toMatch(/master encryption key/i);
    expect(messages(warn).join('\n')).toContain(statePath);

    warn.mockClear();

    const second = await boot(statePath);
    await second.config.bootstrap();

    await expect(second.config.getMasterEncryptionKey()).resolves.toEqual(key);
    expect(warn).not.toHaveBeenCalled();

    await second.close();
  });

  it('warns when the state database is opened from a different path than it was created at', async () => {
    const first = await boot(statePath);
    await first.config.bootstrap();
    await first.close();

    const movedPath = await mkdtemp(join(tmpdir(), 'yucca-state-moved-'));
    await copyFile(join(statePath, 'state.sqlite3'), join(movedPath, 'state.sqlite3'));
    warn.mockClear();

    const second = await boot(movedPath);
    await second.config.bootstrap();
    await second.close();

    const warnings = messages(warn).join('\n');
    expect(warnings).toContain(statePath);
    expect(warnings).toContain(movedPath);
  });

  it('refuses to generate a new master encryption key when repositories already exist', async () => {
    const first = await boot(statePath);
    await first.config.bootstrap();
    first.database.prepare('INSERT INTO backends (id, configuration) VALUES (?, ?)').run('backend', '{}');
    first.database.prepare('INSERT INTO repositories (id, backendId) VALUES (?, ?)').run('repository', 'backend');
    first.database.prepare("DELETE FROM config WHERE key = 'encryption-key'").run();
    await first.close();

    const second = await boot(statePath);

    await expect(second.config.bootstrap()).rejects.toThrow(/encryption key/i);
    await expect(second.config.hasEncryptionKey()).resolves.toBe(false);

    await second.close();
  });
});
