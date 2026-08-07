import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "repositories" ADD "storageAccessKeyId" text;`.execute(db);
  await sql`ALTER TABLE "repositories" ADD "storageSecretAccessKey" text;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "repositories" DROP COLUMN "storageSecretAccessKey";`.execute(db);
  await sql`ALTER TABLE "repositories" DROP COLUMN "storageAccessKeyId";`.execute(db);
}
