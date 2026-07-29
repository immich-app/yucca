import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('repositories').addColumn('siteCode', 'text').execute();
  await db.schema.alterTable('repositories').addColumn('storageClusterCode', 'text').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('repositories').dropColumn('storageClusterCode').execute();
  await db.schema.alterTable('repositories').dropColumn('siteCode').execute();
}
