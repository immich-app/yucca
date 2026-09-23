import { Test } from '@nestjs/testing';
import Database from 'better-sqlite3';
import { SqliteDialect } from 'kysely';
import { KyselyModule } from 'nestjs-kysely';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModuleConfigProvider } from 'src/moduleConfig';
import { ConfigRepository } from 'src/repositories/config.repository';
import { DatabaseRepository } from 'src/repositories/database.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { StorageRepository } from 'src/repositories/storage.repository';

type Boot = {
  config: ConfigRepository;
  rows: () => { key: string; value: string | null }[];
  close: () => Promise<void>;
};

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
    rows: () =>
      database.prepare('SELECT key, value FROM config ORDER BY key').all() as { key: string; value: string | null }[],
    close: async () => {
      await moduleFixture.close();
      if (database.open) {
        database.close();
      }
    },
  };
}

function row(booted: Boot, key: string) {
  return booted.rows().filter((candidate) => candidate.key === key);
}

const hex = (fill: string) => fill.repeat(64);

let statePath: string;
let booted: Boot;

beforeEach(async () => {
  statePath = await mkdtemp(join(tmpdir(), 'yucca-config-'));
  booted = await boot(statePath);
});

afterEach(async () => {
  await booted.close();
});

describe('Configuration upsert', () => {
  it('starts with an empty configuration table', () => {
    expect(booted.rows()).toEqual([]);
  });

  it('inserts a single key and then updates it in place without touching its neighbours', async () => {
    await booted.config.bootstrap();
    const secret = await booted.config.getSessionSecret();
    const before = booted.rows();

    await booted.config.importEncryptionKey(hex('a'));

    await expect(booted.config.getMasterEncryptionKey()).resolves.toEqual(hex('a'));
    await expect(booted.config.getSessionSecret()).resolves.toEqual(secret);
    expect(booted.rows()).toHaveLength(before.length);
    expect(booted.rows().filter((candidate) => candidate.key !== 'encryption-key')).toEqual(
      before.filter((candidate) => candidate.key !== 'encryption-key'),
    );
  });

  it('keeps one row per key across repeated writes of the same key', async () => {
    await booted.config.importEncryptionKey(hex('a'));
    await booted.config.importEncryptionKey(hex('b'));
    await booted.config.importEncryptionKey(hex('c'));

    expect(row(booted, 'encryption-key')).toEqual([{ key: 'encryption-key', value: hex('c') }]);
  });

  it('writes two keys at once with different values on first insert', async () => {
    await booted.config.setThrottle({ bytesPerSec: 1000, quietHours: '01:00-02:00' });

    expect(row(booted, 'throttle-bytes-per-sec')).toEqual([{ key: 'throttle-bytes-per-sec', value: '1000' }]);
    expect(row(booted, 'throttle-quiet-hours')).toEqual([{ key: 'throttle-quiet-hours', value: '01:00-02:00' }]);
  });

  it('updates two conflicting keys to their own new values rather than a shared one', async () => {
    await booted.config.setThrottle({ bytesPerSec: 1000, quietHours: '01:00-02:00' });
    await booted.config.setThrottle({ bytesPerSec: 2000, quietHours: '03:00-04:00' });

    expect(row(booted, 'throttle-bytes-per-sec')).toEqual([{ key: 'throttle-bytes-per-sec', value: '2000' }]);
    expect(row(booted, 'throttle-quiet-hours')).toEqual([{ key: 'throttle-quiet-hours', value: '03:00-04:00' }]);
    await expect(booted.config.getThrottle()).resolves.toEqual({ bytesPerSec: 2000, quietHours: '03:00-04:00' });
  });

  it('updates only one of two keys when the other is written unchanged', async () => {
    await booted.config.setThrottle({ bytesPerSec: 1000, quietHours: '01:00-02:00' });
    await booted.config.setThrottle({ bytesPerSec: 1000, quietHours: '05:00-06:00' });

    await expect(booted.config.getThrottle()).resolves.toEqual({ bytesPerSec: 1000, quietHours: '05:00-06:00' });
  });

  it('stores an empty string as an empty string rather than null or a missing row', async () => {
    await booted.config.setThrottle({ bytesPerSec: 1000, quietHours: '01:00-02:00' });
    await booted.config.setThrottle({ bytesPerSec: 1000 });

    expect(row(booted, 'throttle-quiet-hours')).toEqual([{ key: 'throttle-quiet-hours', value: '' }]);
    await expect(booted.config.getThrottle()).resolves.toEqual({ bytesPerSec: 1000, quietHours: undefined });
  });

  it.each([
    ['single and double quotes', `it's "quoted"`],
    ['sql-looking text', `'); DROP TABLE config; --`],
    ['unicode outside the basic plane', 'clé 密钥 🔑 ключ'],
    ['a very long string', 'x'.repeat(100_000)],
  ])('round trips %s through insert and update', async (_, value) => {
    await booted.config.importEncryptionKey(hex('0'));
    await booted.config.importEncryptionKey(value);

    await expect(booted.config.getMasterEncryptionKey()).resolves.toEqual(value);
    expect(row(booted, 'encryption-key')).toEqual([{ key: 'encryption-key', value }]);
  });

  it('leaves every key at its own last written value when writers interleave', async () => {
    await booted.config.bootstrap();
    await booted.config.setThrottle({ bytesPerSec: 1000, quietHours: '01:00-02:00' });
    await booted.config.enableTelemetry();
    await booted.config.importEncryptionKey(hex('a'));
    await booted.config.confirmKeyOnboarded();
    await booted.config.setThrottle({ bytesPerSec: 2000, quietHours: '03:00-04:00' });
    await booted.config.skipExtraConfig();
    await booted.config.importEncryptionKey(hex('b'));
    await booted.config.setThrottle({ bytesPerSec: 3000 });

    await expect(booted.config.getMasterEncryptionKey()).resolves.toEqual(hex('b'));
    await expect(booted.config.getThrottle()).resolves.toEqual({ bytesPerSec: 3000, quietHours: undefined });
    await expect(booted.config.hasTelemetry()).resolves.toBe(true);
    await expect(booted.config.hasOnboardedKey()).resolves.toBe(true);
    await expect(booted.config.hasSkippedExtraConfig()).resolves.toBe(true);
    await expect(booted.config.hasSessionSecret()).resolves.toBe(true);
    expect(booted.rows().map((candidate) => candidate.key)).toEqual([
      'encryption-key',
      'onboarded-key',
      'session-secret',
      'skipped-onboarding-extra-config',
      'state-path',
      'telemetry',
      'throttle-bytes-per-sec',
      'throttle-quiet-hours',
    ]);
  });

  it('reports flags as absent until their writer runs', async () => {
    await expect(booted.config.hasTelemetry()).resolves.toBe(false);
    await expect(booted.config.hasOnboardedKey()).resolves.toBe(false);
    await expect(booted.config.hasSkippedExtraConfig()).resolves.toBe(false);
    await expect(booted.config.hasEncryptionKey()).resolves.toBe(false);
    await expect(booted.config.hasSessionSecret()).resolves.toBe(false);
  });

  it('keeps the key and secret across a second bootstrap', async () => {
    await booted.config.bootstrap();
    const key = await booted.config.getMasterEncryptionKey();
    const secret = await booted.config.getSessionSecret();

    await booted.config.bootstrap();

    await expect(booted.config.getMasterEncryptionKey()).resolves.toEqual(key);
    await expect(booted.config.getSessionSecret()).resolves.toEqual(secret);
  });

  it('survives closing and reopening the database', async () => {
    await booted.config.bootstrap();
    await booted.config.importEncryptionKey(hex('a'));
    await booted.config.setThrottle({ bytesPerSec: 1000, quietHours: '01:00-02:00' });
    await booted.config.setThrottle({ bytesPerSec: 2000, quietHours: '03:00-04:00' });
    await booted.config.enableTelemetry();
    const secret = await booted.config.getSessionSecret();
    const rows = booted.rows();
    await booted.close();

    booted = await boot(statePath);

    expect(booted.rows()).toEqual(rows);
    await expect(booted.config.getMasterEncryptionKey()).resolves.toEqual(hex('a'));
    await expect(booted.config.getSessionSecret()).resolves.toEqual(secret);
    await expect(booted.config.getThrottle()).resolves.toEqual({ bytesPerSec: 2000, quietHours: '03:00-04:00' });
    await expect(booted.config.hasTelemetry()).resolves.toBe(true);
  });
});
