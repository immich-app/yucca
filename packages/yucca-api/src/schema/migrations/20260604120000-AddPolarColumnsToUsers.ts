import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "users" ADD "polarUserId" character varying; -- missing in target`.execute(db);
  await sql`ALTER TABLE "users" ADD "polarSubscriptionId" character varying; -- missing in target`.execute(db);
  await sql`ALTER TABLE "users" ADD CONSTRAINT "users_polarUserId_uq" UNIQUE ("polarUserId"); -- missing in target`.execute(db);
  await sql`ALTER TABLE "users" ADD CONSTRAINT "users_polarSubscriptionId_uq" UNIQUE ("polarSubscriptionId"); -- missing in target`.execute(db);
  await sql`CREATE INDEX "users_polarUserId_idx" ON "users" ("polarUserId"); -- missing in target`.execute(db);
  await sql`CREATE INDEX "users_polarSubscriptionId_idx" ON "users" ("polarSubscriptionId"); -- missing in target`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX "users_polarUserId_idx"; -- missing in source`.execute(db);
  await sql`DROP INDEX "users_polarSubscriptionId_idx"; -- missing in source`.execute(db);
  await sql`ALTER TABLE "users" DROP CONSTRAINT "users_polarUserId_uq"; -- missing in source`.execute(db);
  await sql`ALTER TABLE "users" DROP CONSTRAINT "users_polarSubscriptionId_uq"; -- missing in source`.execute(db);
  await sql`ALTER TABLE "users" DROP COLUMN "polarUserId"; -- missing in source`.execute(db);
  await sql`ALTER TABLE "users" DROP COLUMN "polarSubscriptionId"; -- missing in source`.execute(db);
}
