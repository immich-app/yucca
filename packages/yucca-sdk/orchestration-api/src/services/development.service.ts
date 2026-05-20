import { BadRequestException, Injectable, Post } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';
import { DB } from '../schema';
import { BootstrapService } from './bootstrap.service';

@Injectable()
export class DevelopmentService {
  constructor(
    @InjectKysely('orchestrator') private readonly db: Kysely<DB>,
    private readonly moduleConfig: ModuleConfigRepository,
    private readonly bootstrap: BootstrapService,
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

    await this.bootstrap.onApplicationBootstrap();
  }
}
