import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('repositoryIntegrationImmich')
    .addColumn('id', 'text', (col) => col.primaryKey().references('repositories.id'))
    .addColumn('configuration', 'jsonb', (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('repositoryIntegrationImmich').execute();
}
