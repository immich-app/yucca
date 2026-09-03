import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TYPE "audit_action_enum" AS ENUM ('repository.delete','repository.disable-worm');`.execute(db);
  await sql`CREATE TABLE "auditLog" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "action" audit_action_enum NOT NULL,
  "userId" uuid,
  "detail" jsonb NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "auditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "auditLog_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "auditLog_userId_idx" ON "auditLog" ("userId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "auditLog";`.execute(db);
  await sql`DROP TYPE "audit_action_enum";`.execute(db);
}
