import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

type MeterReading = { sizeBytes: number; objectCount: number };

@Injectable()
export class MeterRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  record(repositoryId: string, { sizeBytes, objectCount }: MeterReading) {
    const row = { repositoryId, sizeBytes, objectCount, timestamp: new Date() };

    return this.db.transaction().execute(async (tx) => {
      await tx
        .insertInto('repositoryMeter')
        .values(row)
        .onConflict((oc) => oc.column('repositoryId').doUpdateSet({ sizeBytes, objectCount, timestamp: row.timestamp }))
        .execute();

      await tx.insertInto('repositoryMeterHistory').values(row).execute();
    });
  }
}
