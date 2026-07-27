import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Users gain a creation timestamp; everyone predating this migration gets a
  // fixed sentinel date so batch enrollment ("oldest first") stays stable.
  await sql`ALTER TABLE "users" ADD "createdAt" timestamp with time zone NOT NULL DEFAULT now();`.execute(db);
  await sql`UPDATE "users" SET "createdAt" = '2026-01-01T00:00:00Z';`.execute(db);

  await sql`CREATE TABLE "consumers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
  "type" character varying NOT NULL,
  "name" character varying NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "lastSeenAt" timestamp with time zone,
  CONSTRAINT "consumers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "consumers_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "consumers_userId_idx" ON "consumers" ("userId");`.execute(db);

  await sql`CREATE TABLE "resticTokens" (
  "jti" uuid NOT NULL,
  "repositoryId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "consumerId" uuid,
  "mintedBy" character varying NOT NULL,
  "label" character varying,
  "expiresAt" timestamp with time zone NOT NULL,
  "revokedAt" timestamp with time zone,
  "revokedBy" character varying,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "resticTokens_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "resticTokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "resticTokens_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "consumers" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "resticTokens_pkey" PRIMARY KEY ("jti")
);`.execute(db);
  await sql`CREATE INDEX "resticTokens_repositoryId_idx" ON "resticTokens" ("repositoryId");`.execute(db);
  await sql`CREATE INDEX "resticTokens_userId_idx" ON "resticTokens" ("userId");`.execute(db);
  await sql`CREATE INDEX "resticTokens_consumerId_idx" ON "resticTokens" ("consumerId");`.execute(db);
  await sql`CREATE INDEX "resticTokens_expiresAt_idx" ON "resticTokens" ("expiresAt");`.execute(db);

  await sql`CREATE TABLE "userFeatureFlagOverride" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
  "flag" character varying NOT NULL,
  "value" boolean NOT NULL,
  "setBy" character varying NOT NULL,
  "reason" character varying,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "userFeatureFlagOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "userFeatureFlagOverride_userId_flag_uq" UNIQUE ("userId", "flag"),
  CONSTRAINT "userFeatureFlagOverride_pkey" PRIMARY KEY ("id")
);`.execute(db);

  await sql`ALTER TABLE "sessions" ADD "consumerId" uuid;`.execute(db);
  await sql`ALTER TABLE "sessions" ADD CONSTRAINT "sessions_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "consumers" ("id") ON UPDATE CASCADE ON DELETE CASCADE;`.execute(
    db,
  );
  await sql`CREATE INDEX "sessions_consumerId_idx" ON "sessions" ("consumerId");`.execute(db);
  await sql`ALTER TABLE "sessions" ADD "kind" character varying;`.execute(db);

  await sql`ALTER TABLE "repositories" ADD "consumerId" uuid;`.execute(db);
  await sql`ALTER TABLE "repositories" ADD CONSTRAINT "repositories_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "consumers" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;`.execute(
    db,
  );
  await sql`CREATE INDEX "repositories_consumerId_idx" ON "repositories" ("consumerId");`.execute(db);

  // Backfill: every real user gets a default immich consumer (the only
  // historical consumer); the admin service user's bench repos are restic.
  await sql`INSERT INTO "consumers" ("userId", "type", "name")
  SELECT "id", 'immich', 'Immich' FROM "users" WHERE "sub" != 'yucca-admin-service';`.execute(db);
  await sql`INSERT INTO "consumers" ("userId", "type", "name")
  SELECT "id", 'restic', 'admin' FROM "users" WHERE "sub" = 'yucca-admin-service';`.execute(db);

  // Exactly one consumer per user exists at this point.
  await sql`UPDATE "repositories" r SET "consumerId" = c."id" FROM "consumers" c WHERE c."userId" = r."userId";`.execute(
    db,
  );
  await sql`ALTER TABLE "repositories" ALTER COLUMN "consumerId" SET NOT NULL;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "repositories" DROP COLUMN "consumerId";`.execute(db);
  await sql`ALTER TABLE "sessions" DROP COLUMN "kind";`.execute(db);
  await sql`ALTER TABLE "sessions" DROP COLUMN "consumerId";`.execute(db);
  await sql`DROP TABLE "userFeatureFlagOverride";`.execute(db);
  await sql`DROP TABLE "resticTokens";`.execute(db);
  await sql`DROP TABLE "consumers";`.execute(db);
  await sql`ALTER TABLE "users" DROP COLUMN "createdAt";`.execute(db);
}
