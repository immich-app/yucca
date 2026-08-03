import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
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
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "resticTokens";`.execute(db);
}
