import { Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class LockRepository {
  private locks = new Set<symbol>();

  constructor() {}

  async tryWithLock<T>(key: symbol, callback: () => Promise<T>): Promise<T> {
    if (this.locks.has(key)) {
      throw new InternalServerErrorException(`Lock ${String(key)} is already held`);
    }

    try {
      this.locks.add(key);
      return callback();
    } finally {
      this.locks.delete(key);
    }
  }
}
