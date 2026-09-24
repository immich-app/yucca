import Database from 'better-sqlite3';
import { FileMigrationProvider, Kysely, Migrator, SqliteDialect } from 'kysely';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

type Migrated = {
  database: InstanceType<typeof Database>;
  migrator: Migrator;
  close: () => Promise<void>;
};

async function migrateToLatest(): Promise<Migrated> {
  const database = new Database(':memory:');
  const db = new Kysely<unknown>({ dialect: new SqliteDialect({ database }) });
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs: { readdir },
      path: { join },
      migrationFolder: join(__dirname, '..', 'src/schema/migrations'),
    }),
  });

  const { error } = await migrator.migrateToLatest();
  if (error) {
    throw error;
  }

  return { database, migrator, close: () => db.destroy() };
}

let migrated: Migrated;

beforeEach(async () => {
  migrated = await migrateToLatest();
  migrated.database.prepare(`INSERT INTO backends (id, configuration) VALUES ('backend', '{}')`).run();
  migrated.database.prepare(`INSERT INTO repositories (id, backendId) VALUES ('repository', 'backend')`).run();
});

afterEach(async () => {
  await migrated.close();
});

function insertCancelledRun(id: string) {
  migrated.database
    .prepare(`INSERT INTO runHistory (id, repositoryId, status) VALUES (?, 'repository', 'cancelled')`)
    .run(id);
}

function insertCancelledMetrics() {
  migrated.database
    .prepare(`INSERT INTO repositoryLocalMetrics (id, lastBackupStatus) VALUES ('repository', 'cancelled')`)
    .run();
}

async function migrateDownToLastBackupStatus() {
  const { error } = await migrated.migrator.migrateTo('20260814120100-AddLastBackupStatus');
  if (error) {
    throw error;
  }
}

describe('AllowCancelledStatus migration', () => {
  it('rewrites cancelled statuses as failed when migrating down', async () => {
    insertCancelledRun('run');
    insertCancelledMetrics();

    await migrateDownToLastBackupStatus();

    expect(migrated.database.prepare(`SELECT id, status FROM runHistory`).all()).toEqual([
      { id: 'run', status: 'failed' },
    ]);
    expect(migrated.database.prepare(`SELECT id, lastBackupStatus FROM repositoryLocalMetrics`).all()).toEqual([
      { id: 'repository', lastBackupStatus: 'failed' },
    ]);
  });

  it('rejects cancelled statuses after migrating down', async () => {
    await migrateDownToLastBackupStatus();

    expect(() => insertCancelledRun('run')).toThrow(/CHECK constraint failed/);
    expect(() => insertCancelledMetrics()).toThrow(/CHECK constraint failed/);
  });
});
