import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "repositoryMetrics" ADD "lastStarted" timestamp with time zone;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "repositoryMetrics" DROP COLUMN "lastStarted";`.execute(db);
}
