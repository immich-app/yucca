import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TYPE "ticket_action_enum" AS ENUM ('repository.delete','repository.disable-worm');`.execute(db);
  await sql`CREATE TABLE "tickets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "token" character varying NOT NULL,
  "oidcState" character varying NOT NULL,
  "oidcCodeVerifier" character varying NOT NULL,
  "userId" uuid NOT NULL,
  "repositoryId" uuid NOT NULL,
  "action" ticket_action_enum NOT NULL,
  "validAt" timestamp with time zone,
  "expiresAt" timestamp with time zone NOT NULL,
  "consumedAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "tickets_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "tickets_token_uq" UNIQUE ("token"),
  CONSTRAINT "tickets_oidcState_uq" UNIQUE ("oidcState"),
  CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "tickets_userId_idx" ON "tickets" ("userId");`.execute(db);
  await sql`CREATE INDEX "tickets_repositoryId_idx" ON "tickets" ("repositoryId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "tickets";`.execute(db);
  await sql`DROP TYPE "ticket_action_enum";`.execute(db);
}
