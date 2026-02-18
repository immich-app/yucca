import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DatabaseRepository } from '../repositories/database.repository';

@Injectable()
export class DatabaseService implements OnApplicationBootstrap {
  constructor(private readonly repository: DatabaseRepository) {}

  async onApplicationBootstrap() {
    await this.repository.runMigrations();
  }
}
