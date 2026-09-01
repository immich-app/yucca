import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "repositories" ALTER COLUMN "siteCode" SET DEFAULT NULL;`.execute(db);
  await sql`ALTER TABLE "repositories" ALTER COLUMN "storageClusterCode" SET DEFAULT NULL;`.execute(db);
  await sql`ALTER TABLE "repositoryMeter" ALTER COLUMN "storageClusterCode" SET DEFAULT NULL;`.execute(db);
  await sql`ALTER TABLE "repositoryMeterHistory" ALTER COLUMN "storageClusterCode" SET DEFAULT NULL;`.execute(db);
  await sql`CREATE INDEX "userFeatureFlagOverride_userId_idx" ON "userFeatureFlagOverride" ("userId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX "userFeatureFlagOverride_userId_idx";`.execute(db);
  await sql`ALTER TABLE "repositoryMeter" ALTER COLUMN "storageClusterCode" SET DEFAULT 'local-dev'::text;`.execute(db);
  await sql`ALTER TABLE "repositoryMeterHistory" ALTER COLUMN "storageClusterCode" SET DEFAULT 'local-dev'::text;`.execute(db);
  await sql`ALTER TABLE "repositories" ALTER COLUMN "siteCode" SET DEFAULT 'local'::text;`.execute(db);
  await sql`ALTER TABLE "repositories" ALTER COLUMN "storageClusterCode" SET DEFAULT 'local-dev'::text;`.execute(db);
}
