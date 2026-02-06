import { env } from '@common/server/env';
import { LoggerRepository } from '@common/server/otel';
import { Injectable } from '@nestjs/common';
import { FileMigrationProvider, Kysely, Migrator } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DB } from 'src/schema';

@Injectable()
export class DatabaseRepository {
  constructor(
    @InjectKysely() private db: Kysely<DB>,
    private logger: LoggerRepository,
  ) {}

  async shutdown() {
    await this.db.destroy();
  }

  async runMigrations(): Promise<void> {
    this.logger.debug('Running migrations');

    const migrator = this.createMigrator();
    const { error, results } = await migrator.migrateToLatest();

    for (const result of results ?? []) {
      if (result.status === 'Success') {
        this.logger.debug(`Migration "${result.migrationName}" succeeded`);
      }

      if (result.status === 'Error') {
        this.logger.error(`Migration "${result.migrationName}" failed`);
      }
    }

    if (error) {
      this.logger.error(`Migrations failed: ${error}`);

      if (env.NODE_ENV === 'development') {
        this.logger.warn(`⚠️ Ignoring error in development mode!`);
      } else {
        throw error;
      }
    }

    this.logger.info('Finished running migrations');
  }

  private createMigrator(): Migrator {
    return new Migrator({
      db: this.db,
      migrationLockTableName: 'kysely_migrations_lock',
      allowUnorderedMigrations: env.NODE_ENV === 'development',
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
