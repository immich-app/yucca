import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('sub', 'varchar')
    .addColumn('name', 'varchar')
    .addColumn('email', 'varchar')
    .execute();

  await db.schema
    .createTable('sessions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('userId', 'uuid')
    .addColumn('accessToken', 'varchar')
    .addForeignKeyConstraint('userIdFkey', ['userId'], 'users', ['id'], (cb) => cb.onDelete('cascade'))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('users').execute();
  await db.schema.dropTable('sessions').execute();
}
