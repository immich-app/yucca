import { Injectable } from '@nestjs/common';
import { FileMigrationProvider, Kysely, Migrator, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { join } from 'node:path';
import { DB } from '../schema';
import { LoggingRepository } from './logging.repository';
import { StorageRepository } from './storage.repository';

@Injectable()
export class DatabaseRepository {
  constructor(
    @InjectKysely('orchestrator') private db: Kysely<DB>,
    private readonly storage: StorageRepository,
    private readonly logger: LoggingRepository,
  ) {
    this.logger.setContext(DatabaseRepository.name);
  }

  async runMigrations(): Promise<void> {
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
      throw new Error('Migrations failed.');
    }

    this.logger.log('Finished running migrations');
  }

  async restoreFrom(path: string): Promise<void> {
    await sql`PRAGMA foreign_keys = OFF`.execute(this.db);

    try {
      await sql`ATTACH DATABASE ${path} AS restored`.execute(this.db);

      const tables = await sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      `.execute(this.db);

      for (const { name } of tables.rows) {
        await sql`DELETE FROM ${sql.table(name)}`.execute(this.db);
        await sql`INSERT INTO ${sql.table(name)} SELECT * FROM ${sql.table(`restored.${name}`)}`.execute(this.db);
      }

      await sql`DETACH DATABASE restored`.execute(this.db);
    } finally {
      await sql`PRAGMA foreign_keys = ON`.execute(this.db);
    }

    await this.runMigrations();
  }

  private createMigrator(): Migrator {
    return new Migrator({
      db: this.db,
      migrationLockTableName: 'kysely_migrations_lock',
      migrationTableName: 'kysely_migrations',
      provider: new FileMigrationProvider({
        fs: {
          readdir: this.storage.readdir,
        },
        path: { join },
        migrationFolder: join(__dirname, '..', 'schema/migrations'),
      }),
    });
  }
}
