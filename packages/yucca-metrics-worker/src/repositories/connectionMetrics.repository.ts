import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

export type ConnectionRollup = {
  connectionId: string;
  type: string;
  sizeBytes: number;
  objectCount: number;
  repositoryCount: number;
};

type ConnectionMetric = {
  connectionId: string;
  sizeBytes: number;
  objectCount: number;
  billableBytes: number;
  repositoryCount: number;
};

@Injectable()
export class ConnectionMetricsRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async getRollups(): Promise<ConnectionRollup[]> {
    const rows = await this.db
      .selectFrom('connections')
      .leftJoin('repositories', 'repositories.connectionId', 'connections.id')
      .leftJoin('repositoryMeter', 'repositoryMeter.repositoryId', 'repositories.id')
      .select(({ fn }) => [
        'connections.id as connectionId',
        'connections.type as type',
        fn.coalesce(fn.sum('repositoryMeter.sizeBytes'), sql<string>`0`).as('sizeBytes'),
        fn.coalesce(fn.sum('repositoryMeter.objectCount'), sql<string>`0`).as('objectCount'),
        fn.count('repositories.id').as('repositoryCount'),
      ])
      .groupBy(['connections.id', 'connections.type'])
      .execute();

    return rows.map((row) => ({
      connectionId: row.connectionId,
      type: row.type,
      sizeBytes: Number(row.sizeBytes),
      objectCount: Number(row.objectCount),
      repositoryCount: Number(row.repositoryCount),
    }));
  }

  upsert({ connectionId, sizeBytes, objectCount, billableBytes, repositoryCount }: ConnectionMetric) {
    return this.db
      .insertInto('connectionMetrics')
      .values({ connectionId, sizeBytes, objectCount, billableBytes, repositoryCount, updatedAt: new Date() })
      .onConflict((oc) =>
        oc
          .column('connectionId')
          .doUpdateSet({ sizeBytes, objectCount, billableBytes, repositoryCount, updatedAt: new Date() }),
      )
      .execute();
  }
}
