import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "discordTickets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "threadId" character varying NOT NULL,
  "staffThreadId" character varying,
  "freshdeskTicketId" character varying NOT NULL,
  "discordUserId" character varying NOT NULL,
  "userId" uuid,
  "emailSubscribed" boolean NOT NULL DEFAULT false,
  "lastMirroredMessageId" character varying,
  "lastStaffMirroredMessageId" character varying,
  "lastFreshdeskConversationId" character varying,
  "closedAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "discordTickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT "discordTickets_threadId_uq" UNIQUE ("threadId"),
  CONSTRAINT "discordTickets_freshdeskTicketId_uq" UNIQUE ("freshdeskTicketId"),
  CONSTRAINT "discordTickets_pkey" PRIMARY KEY ("id")
);`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "discordTickets";`.execute(db);
}
