import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('runHistory')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('repositoryId', 'text', (col) => col.references('repositories.id'))
    .addColumn('start', 'datetime')
    .addColumn('end', 'datetime')
    .addColumn('logFilePath', 'text')
    .addColumn('status', 'text', (col) => col.check(sql`status IN ('incomplete', 'complete', 'failed')`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('runHistory').execute();
}
