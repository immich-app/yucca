import { Injectable } from '@nestjs/common';
import { Insertable, Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from '../schema';
import { ScheduleTable } from '../schema/tables/schedule.table';

@Injectable()
export class ScheduleRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  create(schedule: Insertable<ScheduleTable>) {
    return this.db.insertInto('schedules').values(schedule).returningAll().executeTakeFirstOrThrow();
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
