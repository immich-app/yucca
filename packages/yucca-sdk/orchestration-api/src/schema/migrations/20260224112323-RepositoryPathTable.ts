import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('repositoryPaths')
    .addColumn('id', 'text', (col) => col.references('repositories.id'))
    .addColumn('path', 'text')
    .addPrimaryKeyConstraint('primary_key', ['id', 'path'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('repositoryPaths').execute();
}
