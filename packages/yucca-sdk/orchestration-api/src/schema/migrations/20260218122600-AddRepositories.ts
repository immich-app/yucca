import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('backends')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('configuration', 'jsonb')
    .execute();

  await db.schema
    .createTable('repositories')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('backendId', 'text', (col) => col.references('backends.id'))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('repositories').execute();
  await db.schema.dropTable('backends').execute();
}
