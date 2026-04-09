import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('repositoryIntegrationImmich')
    .addColumn('scheduleId', 'text', (col) => col.references('schedules.id'))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('repositoryIntegrationImmich').dropColumn('scheduleId').execute();
}
