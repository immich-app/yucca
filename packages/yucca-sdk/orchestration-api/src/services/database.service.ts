import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigRepository } from '../repositories/config.repository';
import { DatabaseRepository } from '../repositories/database.repository';

@Injectable()
export class DatabaseService implements OnApplicationBootstrap {
  constructor(
    private readonly repository: DatabaseRepository,
    private readonly config: ConfigRepository,
  ) {}

  async onApplicationBootstrap() {
    await this.repository.runMigrations();
    await this.config.bootstrap();
  }
}
