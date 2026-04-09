import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "users" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "sub" character varying NOT NULL,
  "name" character varying NOT NULL,
  "email" character varying NOT NULL,
  CONSTRAINT "users_sub_uq" UNIQUE ("sub"),
  CONSTRAINT "users_email_uq" UNIQUE ("email"),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "users_sub_idx" ON "users" ("sub");`.execute(db);
  await sql`CREATE TABLE "repositories" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
  "worm" boolean NOT NULL,
  CONSTRAINT "repositories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "repositories_userId_idx" ON "repositories" ("userId");`.execute(db);
  await sql`CREATE TABLE "sessions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
  "accessToken" character varying NOT NULL,
  CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "sessions_accessToken_uq" UNIQUE ("accessToken"),
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "sessions_userId_idx" ON "sessions" ("userId");`.execute(db);
  await sql`CREATE INDEX "sessions_accessToken_idx" ON "sessions" ("accessToken");`.execute(db);
  await sql`CREATE TABLE "migration_overrides" (
  "name" character varying NOT NULL,
  "value" jsonb NOT NULL,
  CONSTRAINT "migration_overrides_pkey" PRIMARY KEY ("name")
);`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "users";`.execute(db);
  await sql`DROP TABLE "repositories";`.execute(db);
  await sql`DROP TABLE "sessions";`.execute(db);
  await sql`DROP TABLE "migration_overrides";`.execute(db);
}
