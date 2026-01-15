import { Injectable } from '@nestjs/common';
import { FileMigrationProvider, Kysely, Migrator } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DB } from 'src/schema';
import { LoggerRepository } from './logger.repository';

@Injectable()
export class DatabaseRepository {
  constructor(
    @InjectKysely() private db: Kysely<DB>,
    private logger: LoggerRepository,
  ) {
    this.logger.setContext(DatabaseRepository.name);
  }

  async shutdown() {
    await this.db.destroy();
  }

  private createMigrator(): Migrator {
    return new Migrator({
      db: this.db,
      migrationLockTableName: 'kysely_migrations_lock',
      // allowUnorderedMigrations: this.configRepository.isDev(),
      migrationTableName: 'kysely_migrations',
      provider: new FileMigrationProvider({
        fs: { readdir },
        path: { join },
        migrationFolder: join(__dirname, '..', 'schema/migrations'),
      }),
    });
  }
}
