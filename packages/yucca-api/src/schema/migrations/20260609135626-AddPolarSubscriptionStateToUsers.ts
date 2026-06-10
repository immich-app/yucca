import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "users" ADD "polarSubscriptionState" text;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "users" DROP COLUMN "polarSubscriptionState";`.execute(db);
}
