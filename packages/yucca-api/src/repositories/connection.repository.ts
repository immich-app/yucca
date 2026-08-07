import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, sql } from 'kysely';
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

  async getOrCreateDefault(userId: string) {
    return this.db.transaction().execute(async (trx) => {
      // Serialise per user: without this, two concurrent sign-ins can both
      // miss the lookup below and each insert a default connection.
      await sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`.execute(trx);

      const existing = await trx
        .selectFrom('connections')
        .selectAll()
        .where('userId', '=', userId)
        .where('type', '=', 'immich')
        .orderBy('createdAt', 'asc')
        .orderBy('id', 'asc')
        .executeTakeFirst();

      return (
        existing ??
        (await trx
          .insertInto('connections')
          .values({ userId, type: 'immich', name: 'Immich' })
          .returningAll()
          .executeTakeFirstOrThrow())
      );
    });
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
