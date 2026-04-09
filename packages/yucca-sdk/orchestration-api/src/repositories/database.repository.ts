import { Injectable } from '@nestjs/common';
import { FileMigrationProvider, Kysely, Migrator } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DB } from '../schema';

@Injectable()
export class DatabaseRepository {
  constructor(@InjectKysely('orchestrator') private db: Kysely<DB>) {}

  async runMigrations(): Promise<void> {
    const migrator = this.createMigrator();
    const { error, results } = await migrator.migrateToLatest();

    for (const result of results ?? []) {
      if (result.status === 'Success') {
        console.debug(`Migration "${result.migrationName}" succeeded`);
      }

      if (result.status === 'Error') {
        console.error(`Migration "${result.migrationName}" failed`);
      }
    }

    if (error) {
      console.error(`Migrations failed: ${error}`);
      throw new Error('Migrations failed.');
    }

    console.info('Finished running migrations');
  }

  private createMigrator(): Migrator {
    return new Migrator({
      db: this.db,
      migrationLockTableName: 'kysely_migrations_lock',
      migrationTableName: 'kysely_migrations',
      provider: new FileMigrationProvider({
        fs: {
          readdir,
        },
        path: { join },
        migrationFolder: join(__dirname, '..', 'schema/migrations'),
      }),
    });
  }
}
