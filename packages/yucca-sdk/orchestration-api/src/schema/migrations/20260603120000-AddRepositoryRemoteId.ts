import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('repositories').addColumn('remoteId', 'text').execute();
  await sql`UPDATE repositories SET "remoteId" = id`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('repositories').dropColumn('remoteId').execute();
}
