import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('runHistory')
    .addColumn('type', 'text', (col) =>
      col
        .notNull()
        .defaultTo('backup')
        .check(sql`type IN ('backup', 'restore')`),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('runHistory').dropColumn('type').execute();
}
