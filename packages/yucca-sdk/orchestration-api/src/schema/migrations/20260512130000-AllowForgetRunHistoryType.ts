import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  await db.schema
    .createTable('runHistory_new')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('repositoryId', 'text', (col) => col.references('repositories.id'))
    .addColumn('start', 'datetime')
    .addColumn('end', 'datetime')
    .addColumn('logFilePath', 'text')
    .addColumn('status', 'text', (col) => col.check(sql`status IN ('incomplete', 'complete', 'failed')`))
    .addColumn('type', 'text', (col) =>
      col
        .notNull()
        .defaultTo('backup')
        .check(sql`type IN ('backup', 'restore', 'forget')`),
    )
    .as(db.selectFrom('runHistory').selectAll())
    .execute();

  await db.schema.dropTable('runHistory').execute();
  await sql`ALTER TABLE "runHistory_new" RENAME TO "runHistory"`.execute(db);

  await sql`PRAGMA foreign_keys = ON`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.deleteFrom('runHistory').where('type', '=', 'forget').execute();

  await sql`PRAGMA foreign_keys = OFF`.execute(db);

  await db.schema
    .createTable('runHistory_new')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('repositoryId', 'text', (col) => col.references('repositories.id'))
    .addColumn('start', 'datetime')
    .addColumn('end', 'datetime')
    .addColumn('logFilePath', 'text')
    .addColumn('status', 'text', (col) => col.check(sql`status IN ('incomplete', 'complete', 'failed')`))
    .addColumn('type', 'text', (col) =>
      col
        .notNull()
        .defaultTo('backup')
        .check(sql`type IN ('backup', 'restore')`),
    )
    .as(db.selectFrom('runHistory').selectAll())
    .execute();

  await db.schema.dropTable('runHistory').execute();
  await sql`ALTER TABLE "runHistory_new" RENAME TO "runHistory"`.execute(db);

  await sql`PRAGMA foreign_keys = ON`.execute(db);
}
