import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE INDEX "userFeatureFlagOverride_userId_idx" ON "userFeatureFlagOverride" ("userId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX "userFeatureFlagOverride_userId_idx";`.execute(db);
}
