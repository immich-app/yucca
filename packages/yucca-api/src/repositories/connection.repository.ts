import { Injectable } from '@nestjs/common';
import { Insertable, Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { ConnectionTable } from 'src/schema/tables/connection.table';

@Injectable()
export class ConnectionRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  create(connection: Insertable<ConnectionTable>) {
    return this.db.insertInto('connections').values(connection).returningAll().executeTakeFirstOrThrow();
  }

  getById(id: string) {
    return this.db.selectFrom('connections').selectAll().where('id', '=', id).executeTakeFirst();
  }

  getByUser(userId: string) {
    return this.db
      .selectFrom('connections')
      .selectAll()
      .where('userId', '=', userId)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  getByUserWithRepositoryCounts(userId: string) {
    return this.db
      .selectFrom('connections')
      .leftJoin('connectionMetrics', 'connectionMetrics.connectionId', 'connections.id')
      .selectAll('connections')
      .select(['connectionMetrics.sizeBytes', 'connectionMetrics.objectCount', 'connectionMetrics.billableBytes'])
      .select((eb) =>
        eb
          .selectFrom('repositories')
          .select((inner) => inner.fn.countAll<number>().as('count'))
          .whereRef('repositories.connectionId', '=', 'connections.id')
          .as('repositoryCount'),
      )
      .where('userId', '=', userId)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  getByUserTypeName(userId: string, type: string, name: string) {
    return this.db
      .selectFrom('connections')
      .selectAll()
      .where('userId', '=', userId)
      .where('type', '=', type)
      .where('name', '=', name)
      .executeTakeFirst();
  }

  async getOrCreateByType(userId: string, type: string, name: string) {
    const existing = await this.db
      .selectFrom('connections')
      .selectAll()
      .where('userId', '=', userId)
      .where('type', '=', type)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .executeTakeFirst();

    return existing ?? (await this.create({ userId, type, name }));
  }

  async getOrCreateDefault(userId: string) {
    const existing = await this.db
      .selectFrom('connections')
      .selectAll()
      .where('userId', '=', userId)
      .where('type', '=', 'immich')
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .executeTakeFirst();

    return existing ?? (await this.create({ userId, type: 'immich', name: 'Immich' }));
  }

  async touchLastSeen(id: string) {
    await this.db.updateTable('connections').set({ lastSeenAt: new Date() }).where('id', '=', id).execute();
  }

  update(id: string, connection: Partial<Pick<ConnectionTable, 'name'>>) {
    return this.db
      .updateTable('connections')
      .set(connection)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async delete(id: string) {
    await this.db.deleteFrom('connections').where('id', '=', id).execute();
  }
}
