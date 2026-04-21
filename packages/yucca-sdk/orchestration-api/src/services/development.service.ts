import { BadRequestException, Injectable, Post } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { ConfigRepository } from '../repositories/config.repository';
import { DatabaseRepository } from '../repositories/database.repository';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';
import { DB } from '../schema';
import { ScheduleService } from './schedule.service';

@Injectable()
export class DevelopmentService {
  constructor(
    @InjectKysely('orchestrator') private readonly db: Kysely<DB>,
    private readonly database: DatabaseRepository,
    private readonly config: ConfigRepository,
    private readonly moduleConfig: ModuleConfigRepository,
    private readonly schedule: ScheduleService,
  ) {}

  @Post('reset')
  async resetOrchestrator(): Promise<void> {
    if (!this.moduleConfig.get().developmentMode) {
      throw new BadRequestException('Not in development mode');
    }

    await sql`PRAGMA foreign_keys = OFF`.execute(this.db);

    const tables = await sql<{ name: string }>`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `.execute(this.db);

    for (const { name } of tables.rows) {
      await sql`DROP TABLE IF EXISTS ${sql.ref(name)}`.execute(this.db);
    }

    await sql`PRAGMA foreign_keys = ON`.execute(this.db);

    await this.database.runMigrations();
    await this.config.bootstrap();
    await this.schedule.bootstrap();
  }
}
