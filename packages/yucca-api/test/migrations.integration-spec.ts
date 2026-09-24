import { FileMigrationProvider, Kysely, Migrator, sql } from 'kysely';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { BackupStatus } from 'src/enum';
import { ConnectionRepository } from 'src/repositories/connection.repository';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { UserRepository } from 'src/repositories/user.repository';
import { DB } from 'src/schema';
import { getKyselyConfig } from 'src/utils/database';

describe('AllowCancelledBackupStatus migration', () => {
  const schema = `migration_test_${new CryptoRepository().randomHex(8)}`;
  let adminDb: Kysely<DB>;
  let db: Kysely<DB>;
  let migrator: Migrator;

  const getBackupStatuses = async () => {
    const { rows } = await sql<{
      status: string;
    }>`SELECT unnest(enum_range(NULL::backup_status_enum))::text AS status`.execute(db);
    return rows.map((row) => row.status);
  };

  beforeAll(async () => {
    adminDb = new Kysely(getKyselyConfig());
    await sql`CREATE SCHEMA ${sql.id(schema)}`.execute(adminDb);

    db = new Kysely(getKyselyConfig({ connection: { TimeZone: 'UTC', search_path: schema } }));
    migrator = new Migrator({
      db,
      migrationTableSchema: schema,
      migrationLockTableName: 'kysely_migrations_lock',
      migrationTableName: 'kysely_migrations',
      provider: new FileMigrationProvider({
        fs: { readdir },
        path: { join },
        migrationFolder: join(__dirname, '..', 'src/schema/migrations'),
      }),
    });

    const { error } = await migrator.migrateToLatest();
    expect(error).toBeUndefined();
  });

  afterAll(async () => {
    await db.destroy();
    await sql`DROP SCHEMA ${sql.id(schema)} CASCADE`.execute(adminDb);
    await adminDb.destroy();
  });

  it('rewrites cancelled statuses to failed on down and restores cancelled on up', async () => {
    const user = await new UserRepository(db).create({ name: 'foo', email: 'user@example.com', sub: 'foo' });
    const connection = await new ConnectionRepository(db).getOrCreateDefault(user.id);
    const repository = await new RepositoryRepository(db).create({
      name: 'My Repository',
      worm: false,
      userId: user.id,
      siteCode: 'local',
      storageClusterCode: 'local-dev',
      connectionId: connection.id,
    });

    await db
      .insertInto('repositoryMetrics')
      .values({ id: repository.id, sizeBytes: 0, lastBackupStatus: BackupStatus.Cancelled })
      .execute();
    await db
      .insertInto('repositoryMetricsHistory')
      .values({ repositoryId: repository.id, backupStatus: BackupStatus.Cancelled })
      .execute();

    const down = await migrator.migrateTo('20260916113500-BackupStatus');
    expect(down.error).toBeUndefined();
    expect(down.results).toContainEqual({
      migrationName: '20260917121000-AllowCancelledBackupStatus',
      direction: 'Down',
      status: 'Success',
    });

    const metrics = await db.selectFrom('repositoryMetrics').select('lastBackupStatus').execute();
    const history = await db.selectFrom('repositoryMetricsHistory').select('backupStatus').execute();
    expect(metrics).toEqual([{ lastBackupStatus: 'failed' }]);
    expect(history).toEqual([{ backupStatus: 'failed' }]);
    const statusesAfterDown = await getBackupStatuses();
    expect(statusesAfterDown).toEqual(['incomplete', 'complete', 'warn', 'failed']);

    const up = await migrator.migrateTo('20260917121000-AllowCancelledBackupStatus');
    expect(up.error).toBeUndefined();
    expect(up.results).toContainEqual({
      migrationName: '20260917121000-AllowCancelledBackupStatus',
      direction: 'Up',
      status: 'Success',
    });
    const statusesAfterUp = await getBackupStatuses();
    expect(statusesAfterUp).toEqual(['incomplete', 'complete', 'warn', 'failed', 'cancelled']);
  });
});
