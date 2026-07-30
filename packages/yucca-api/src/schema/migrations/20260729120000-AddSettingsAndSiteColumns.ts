import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  const siteCode = process.env['LEGACY_SITE_CODE'];
  const clusterCode = process.env['LEGACY_STORAGE_CLUSTER_CODE'];
  const codePattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
  if (!siteCode || !clusterCode || !codePattern.test(siteCode) || !codePattern.test(clusterCode)) {
    throw new Error(
      'LEGACY_SITE_CODE and LEGACY_STORAGE_CLUSTER_CODE must be stable lowercase internal codes before placement migration',
    );
  }
  if (!clusterCode.startsWith(`${siteCode}-`)) {
    throw new Error(`LEGACY_STORAGE_CLUSTER_CODE '${clusterCode}' must start with '${siteCode}-'`);
  }

  await sql`CREATE TABLE "settings" (
  "scope" text NOT NULL,
  "value" jsonb NOT NULL,
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "settings_pkey" PRIMARY KEY ("scope")
);`.execute(db);
  await sql`ALTER TABLE "repositories" ADD "siteCode" text;`.execute(db);
  await sql`ALTER TABLE "repositories" ADD "storageClusterCode" text;`.execute(db);
  await sql`ALTER TABLE "repositoryMeter" ADD "storageClusterCode" text;`.execute(db);
  await sql`ALTER TABLE "repositoryMeterHistory" ADD "storageClusterCode" text;`.execute(db);

  await sql`UPDATE "repositories"
    SET "siteCode" = ${siteCode}, "storageClusterCode" = ${clusterCode}
    WHERE "siteCode" IS NULL OR "storageClusterCode" IS NULL;`.execute(db);
  await sql`UPDATE "repositoryMeter" AS meter
    SET "storageClusterCode" = repository."storageClusterCode"
    FROM "repositories" AS repository
    WHERE meter."repositoryId" = repository.id AND meter."storageClusterCode" IS NULL;`.execute(db);
  await sql`UPDATE "repositoryMeterHistory" AS meter
    SET "storageClusterCode" = repository."storageClusterCode"
    FROM "repositories" AS repository
    WHERE meter."repositoryId" = repository.id AND meter."storageClusterCode" IS NULL;`.execute(db);

  // Defaults keep old application replicas safe during a rolling deployment:
  // pre-topology inserts omit these columns, but can no longer create NULL
  // placement after the backfill.
  await sql`ALTER TABLE "repositories"
    ALTER COLUMN "siteCode" SET DEFAULT ${sql.lit(siteCode)},
    ALTER COLUMN "siteCode" SET NOT NULL,
    ALTER COLUMN "storageClusterCode" SET DEFAULT ${sql.lit(clusterCode)},
    ALTER COLUMN "storageClusterCode" SET NOT NULL;`.execute(db);
  await sql`ALTER TABLE "repositoryMeter"
    ALTER COLUMN "storageClusterCode" SET DEFAULT ${sql.lit(clusterCode)},
    ALTER COLUMN "storageClusterCode" SET NOT NULL;`.execute(db);
  await sql`ALTER TABLE "repositoryMeterHistory"
    ALTER COLUMN "storageClusterCode" SET DEFAULT ${sql.lit(clusterCode)},
    ALTER COLUMN "storageClusterCode" SET NOT NULL;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "repositoryMeterHistory" DROP COLUMN "storageClusterCode";`.execute(db);
  await sql`ALTER TABLE "repositoryMeter" DROP COLUMN "storageClusterCode";`.execute(db);
  await sql`ALTER TABLE "repositories" DROP COLUMN "storageClusterCode";`.execute(db);
  await sql`ALTER TABLE "repositories" DROP COLUMN "siteCode";`.execute(db);
  await sql`DROP TABLE "settings";`.execute(db);
}
