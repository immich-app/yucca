import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('config')
    .addColumn('key', 'varchar', (col) => col.primaryKey())
    .addColumn('value', 'varchar')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('config').execute();
}
