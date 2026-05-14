import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('repositories')
    .addColumn('retentionPreset', 'text', (col) =>
      col
        .notNull()
        .defaultTo('default')
        .check(sql`retentionPreset IN ('default', 'off')`),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('repositories').dropColumn('retentionPreset').execute();
}
