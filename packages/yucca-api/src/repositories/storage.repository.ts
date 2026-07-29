import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';

@Injectable()
export class StorageRepository {
  readFile(path: string): Promise<string> {
    return readFile(path, 'utf8');
  }
}
