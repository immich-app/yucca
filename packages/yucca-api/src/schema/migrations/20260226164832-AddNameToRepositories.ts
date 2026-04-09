import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "repositories" ADD "name" text NOT NULL DEFAULT 'Unnamed Backup';`.execute(db);
  await sql`ALTER TABLE "repositories" ALTER COLUMN "name" SET DEFAULT NULL;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "repositories" DROP COLUMN "name";`.execute(db);
}
