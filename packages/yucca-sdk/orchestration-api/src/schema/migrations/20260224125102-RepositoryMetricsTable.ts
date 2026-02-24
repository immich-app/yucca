import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('repositoryLocalMetrics')
    .addColumn('id', 'text', (col) => col.primaryKey().references('repositories.id'))
    .addColumn('sizeBytes', 'integer')
    .addColumn('lastBackup', 'datetime')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('repositoryLocalMetrics').execute();
}
