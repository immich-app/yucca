import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('schedules')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('cron', 'jsonb')
    .addColumn('ordering', 'jsonb', (col) => col.defaultTo('[]'))
    .addColumn('lastRun', 'datetime')
    .addColumn('lastFinished', 'datetime')
    .execute();

  await db.schema
    .createTable('repositorySchedules')
    .addColumn('repository', 'text', (col) => col.references('repositories.id'))
    .addColumn('schedule', 'text', (col) => col.references('schedules.id'))
    .addPrimaryKeyConstraint('primary_key', ['repository', 'schedule'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('repositorySchedules').execute();
  await db.schema.dropTable('schedules').execute();
}
