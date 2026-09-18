import { Kysely, sql } from 'kysely';

const rebuildRunHistory = async (db: Kysely<any>, statuses: string) => {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  await db.schema
    .createTable('runHistory_new')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('repositoryId', 'text', (col) => col.references('repositories.id'))
    .addColumn('start', 'datetime')
    .addColumn('end', 'datetime')
    .addColumn('logFilePath', 'text')
    .addColumn('status', 'text', (col) => col.check(sql`status IN (${sql.raw(statuses)})`))
    .addColumn('type', 'text', (col) =>
      col
        .notNull()
        .defaultTo('backup')
        .check(sql`type IN ('backup', 'restore', 'forget')`),
    )
    .execute();

  await sql`
    INSERT INTO "runHistory_new" ("id", "repositoryId", "start", "end", "logFilePath", "status", "type")
    SELECT "id", "repositoryId", "start", "end", "logFilePath", "status", "type" FROM "runHistory"
  `.execute(db);

  await db.schema.dropTable('runHistory').execute();
  await sql`ALTER TABLE "runHistory_new" RENAME TO "runHistory"`.execute(db);

  await sql`PRAGMA foreign_keys = ON`.execute(db);
};

const rebuildRepositoryLocalMetrics = async (db: Kysely<any>, statuses: string) => {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  await db.schema
    .createTable('repositoryLocalMetrics_new')
    .addColumn('id', 'text', (col) => col.primaryKey().references('repositories.id'))
    .addColumn('sizeBytes', 'integer')
    .addColumn('lastBackup', 'datetime')
    .addColumn('lastBackupDuration', 'integer')
    .addColumn('lastBackupStatus', 'text', (col) =>
      col.check(sql`"lastBackupStatus" IS NULL OR "lastBackupStatus" IN (${sql.raw(statuses)})`),
    )
    .execute();

  await sql`
    INSERT INTO "repositoryLocalMetrics_new" ("id", "sizeBytes", "lastBackup", "lastBackupDuration", "lastBackupStatus")
    SELECT "id", "sizeBytes", "lastBackup", "lastBackupDuration", "lastBackupStatus"
    FROM "repositoryLocalMetrics"
    WHERE "rowid" IN (SELECT MAX("rowid") FROM "repositoryLocalMetrics" GROUP BY "id")
  `.execute(db);

  await db.schema.dropTable('repositoryLocalMetrics').execute();
  await sql`ALTER TABLE "repositoryLocalMetrics_new" RENAME TO "repositoryLocalMetrics"`.execute(db);

  await sql`PRAGMA foreign_keys = ON`.execute(db);
};

export async function up(db: Kysely<any>): Promise<void> {
  await rebuildRunHistory(db, `'incomplete', 'complete', 'warn', 'failed', 'cancelled'`);
  await rebuildRepositoryLocalMetrics(db, `'complete', 'warn', 'failed', 'cancelled'`);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.updateTable('runHistory').set('status', 'failed').where('status', '=', 'cancelled').execute();
  await db
    .updateTable('repositoryLocalMetrics')
    .set('lastBackupStatus', 'failed')
    .where('lastBackupStatus', '=', 'cancelled')
    .execute();

  await rebuildRunHistory(db, `'incomplete', 'complete', 'warn', 'failed'`);
  await rebuildRepositoryLocalMetrics(db, `'complete', 'warn', 'failed'`);
}
