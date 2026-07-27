import { Injectable } from '@nestjs/common';
import { Insertable, Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { ConsumerTable } from 'src/schema/tables/consumer.table';

@Injectable()
export class ConsumerRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  create(consumer: Insertable<ConsumerTable>) {
    return this.db.insertInto('consumers').values(consumer).returningAll().executeTakeFirstOrThrow();
  }

  getById(id: string) {
    return this.db.selectFrom('consumers').selectAll().where('id', '=', id).executeTakeFirst();
  }

  getByUser(userId: string) {
    return this.db
      .selectFrom('consumers')
      .selectAll()
      .where('userId', '=', userId)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  getByUserWithRepositoryCounts(userId: string) {
    return this.db
      .selectFrom('consumers')
      .selectAll('consumers')
      .select((eb) =>
        eb
          .selectFrom('repositories')
          .select((inner) => inner.fn.countAll<number>().as('count'))
          .whereRef('repositories.consumerId', '=', 'consumers.id')
          .as('repositoryCount'),
      )
      .where('userId', '=', userId)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  getByUserTypeName(userId: string, type: string, name: string) {
    return this.db
      .selectFrom('consumers')
      .selectAll()
      .where('userId', '=', userId)
      .where('type', '=', type)
      .where('name', '=', name)
      .executeTakeFirst();
  }

  // The user's default consumer is their oldest immich one (backfilled or
  // created at signup) — repositories land there when no consumer is bound.
  async getOrCreateDefault(userId: string) {
    const existing = await this.db
      .selectFrom('consumers')
      .selectAll()
      .where('userId', '=', userId)
      .where('type', '=', 'immich')
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .executeTakeFirst();

    return existing ?? (await this.create({ userId, type: 'immich', name: 'Immich' }));
  }

  async touchLastSeen(id: string) {
    await this.db.updateTable('consumers').set({ lastSeenAt: new Date() }).where('id', '=', id).execute();
  }

  update(id: string, consumer: Partial<Pick<ConsumerTable, 'name'>>) {
    return this.db.updateTable('consumers').set(consumer).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
  }

  async delete(id: string) {
    await this.db.deleteFrom('consumers').where('id', '=', id).execute();
  }
}
