import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Users gain a creation timestamp; everyone predating this migration gets a
  // fixed sentinel date so batch enrollment ("oldest first") stays stable.
  await sql`ALTER TABLE "users" ADD "createdAt" timestamp with time zone NOT NULL DEFAULT now();`.execute(db);
  await sql`UPDATE "users" SET "createdAt" = '2026-01-01T00:00:00Z';`.execute(db);

  await sql`CREATE TABLE "connections" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
  "type" character varying NOT NULL,
  "name" character varying NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "lastSeenAt" timestamp with time zone,
  CONSTRAINT "connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "connections_userId_idx" ON "connections" ("userId");`.execute(db);

  await sql`CREATE TABLE "resticTokens" (
  "jti" uuid NOT NULL,
  "repositoryId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "connectionId" uuid,
  "mintedBy" character varying NOT NULL,
  "label" character varying,
  "expiresAt" timestamp with time zone NOT NULL,
  "revokedAt" timestamp with time zone,
  "revokedBy" character varying,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "resticTokens_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "resticTokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "resticTokens_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "resticTokens_pkey" PRIMARY KEY ("jti")
);`.execute(db);
  await sql`CREATE INDEX "resticTokens_repositoryId_idx" ON "resticTokens" ("repositoryId");`.execute(db);
  await sql`CREATE INDEX "resticTokens_userId_idx" ON "resticTokens" ("userId");`.execute(db);
  await sql`CREATE INDEX "resticTokens_connectionId_idx" ON "resticTokens" ("connectionId");`.execute(db);
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

  await sql`ALTER TABLE "sessions" ADD "connectionId" uuid;`.execute(db);
  await sql`ALTER TABLE "sessions" ADD CONSTRAINT "sessions_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections" ("id") ON UPDATE CASCADE ON DELETE CASCADE;`.execute(
    db,
  );
  await sql`CREATE INDEX "sessions_connectionId_idx" ON "sessions" ("connectionId");`.execute(db);
  await sql`ALTER TABLE "sessions" ADD "kind" character varying;`.execute(db);

  await sql`ALTER TABLE "repositories" ADD "connectionId" uuid;`.execute(db);
  await sql`ALTER TABLE "repositories" ADD CONSTRAINT "repositories_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections" ("id") ON UPDATE CASCADE ON DELETE RESTRICT;`.execute(
    db,
  );
  await sql`CREATE INDEX "repositories_connectionId_idx" ON "repositories" ("connectionId");`.execute(db);

  // Backfill: every real user gets a default immich connection (the only
  // historical connection); the admin service user's bench repos are restic.
  await sql`INSERT INTO "connections" ("userId", "type", "name")
  SELECT "id", 'immich', 'Immich' FROM "users" WHERE "sub" != 'yucca-admin-service';`.execute(db);
  await sql`INSERT INTO "connections" ("userId", "type", "name")
  SELECT "id", 'restic', 'admin' FROM "users" WHERE "sub" = 'yucca-admin-service';`.execute(db);

  // Exactly one connection per user exists at this point.
  await sql`UPDATE "repositories" r SET "connectionId" = c."id" FROM "connections" c WHERE c."userId" = r."userId";`.execute(
    db,
  );
  await sql`ALTER TABLE "repositories" ALTER COLUMN "connectionId" SET NOT NULL;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "repositories" DROP COLUMN "connectionId";`.execute(db);
  await sql`ALTER TABLE "sessions" DROP COLUMN "kind";`.execute(db);
  await sql`ALTER TABLE "sessions" DROP COLUMN "connectionId";`.execute(db);
  await sql`DROP TABLE "userFeatureFlagOverride";`.execute(db);
  await sql`DROP TABLE "resticTokens";`.execute(db);
  await sql`DROP TABLE "connections";`.execute(db);
  await sql`ALTER TABLE "users" DROP COLUMN "createdAt";`.execute(db);
}
