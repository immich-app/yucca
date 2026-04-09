import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from '../schema';
import { ScheduleTable } from '../schema/tables/schedule.table';

@Injectable()
export class ScheduleRepository {
  constructor(@InjectKysely('orchestrator') private db: Kysely<DB>) {}

  create(schedule: Insertable<ScheduleTable>) {
    return this.db.insertInto('schedules').values(schedule).returningAll().executeTakeFirstOrThrow();
  }

  async get(id: string) {
    const { ordering, paused, ...schedule } = await this.db
      .selectFrom('schedules')
      .selectAll('schedules')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    const repositorySchedules = await this.db
      .selectFrom('repositorySchedules')
      .selectAll('repositorySchedules')
      .where('schedule', '=', id)
      .execute();

    return {
      ...schedule,
      paused: !!paused,
      repositories: repositorySchedules
        .filter(({ schedule: scheduleId }) => scheduleId === schedule.id)
        .map(({ repository }) => repository)
        .toSorted((a, b) => ordering.indexOf(a) - ordering.indexOf(b)),
    };
  }

  async getAll() {
    const schedules = await this.db.selectFrom('schedules').selectAll('schedules').execute();
    const repositorySchedules = await this.db
      .selectFrom('repositorySchedules')
      .selectAll('repositorySchedules')
      .execute();

    return schedules.map(({ ordering, paused, ...schedule }) => ({
      ...schedule,
      paused: !!paused,
      repositories: repositorySchedules
        .filter(({ schedule: scheduleId }) => scheduleId === schedule.id)
        .map(({ repository }) => repository)
        .toSorted((a, b) => ordering.indexOf(a) - ordering.indexOf(b)),
    }));
  }

  async getRepositoryIds(id: string) {
    const repositorySchedules = await this.db
      .selectFrom('repositorySchedules')
      .selectAll('repositorySchedules')
      .where('schedule', '=', id)
      .execute();

    return repositorySchedules.map(({ repository }) => repository);
  }

  updateSchedule(id: string, schedule: Updateable<ScheduleTable>) {
    return this.db.updateTable('schedules').where('id', '=', id).set(schedule).returningAll().executeTakeFirstOrThrow();
  }

  removeSchedule(id: string) {
    return this.db.deleteFrom('schedules').where('id', '=', id).execute();
  }

  addRepositoryToSchedule(schedule: string, repository: string) {
    return this.db
      .insertInto('repositorySchedules')
      .values({
        repository,
        schedule,
      })
      .execute();
  }

  removeRepositoryFromSchedule(schedule: string, repository: string) {
    return this.db
      .deleteFrom('repositorySchedules')
      .where('schedule', '=', schedule)
      .where('repository', '=', repository)
      .execute();
  }
}
