import { BadRequestException, Controller, Get } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { ConfigRepository } from '../repositories/config.repository';
import { DatabaseRepository } from '../repositories/database.repository';
import { DB } from '../schema';
import { ScheduleService } from '../services/schedule.service';

@Controller('/debug')
export class DevelopmentController {
  constructor(
    @InjectKysely() private readonly db: Kysely<DB>,
    private readonly database: DatabaseRepository,
    private readonly config: ConfigRepository,
    private readonly schedule: ScheduleService,
  ) {}

  @Get()
  async resetOrchestrator(): Promise<void> {
    if (process.env['NODE_ENV'] !== 'development') {
      throw new BadRequestException(`Not in development mode, currently ${process.env['NODE_ENV']}`);
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
