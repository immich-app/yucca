import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
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

  await sql`INSERT INTO "connections" ("userId", "type", "name")
  SELECT "id", 'immich', 'Immich' FROM "users" WHERE "sub" != 'yucca-admin-service';`.execute(db);
  await sql`INSERT INTO "connections" ("userId", "type", "name")
  SELECT "id", 'restic', 'admin' FROM "users" WHERE "sub" = 'yucca-admin-service';`.execute(db);

  await sql`UPDATE "repositories" r SET "connectionId" = c."id" FROM "connections" c WHERE c."userId" = r."userId";`.execute(
    db,
  );
  await sql`ALTER TABLE "repositories" ALTER COLUMN "connectionId" SET NOT NULL;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "repositories" DROP COLUMN "connectionId";`.execute(db);
  await sql`ALTER TABLE "sessions" DROP COLUMN "kind";`.execute(db);
  await sql`ALTER TABLE "sessions" DROP COLUMN "connectionId";`.execute(db);
  await sql`DROP TABLE "connections";`.execute(db);
}
