import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DatabaseLock } from 'src/enum';
import { DatabaseRepository } from 'src/repositories/database.repository';

@Injectable()
export class DatabaseService implements OnApplicationBootstrap {
  constructor(private readonly repository: DatabaseRepository) {}

  async onApplicationBootstrap() {
    await this.repository.withLock(DatabaseLock.Migrations, () => this.repository.runMigrations());
  }
}
