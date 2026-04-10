import { Injectable } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

@Injectable()
export class StorageRepository {
  createWriteStream(path: string) {
    return createWriteStream(path);
  }

  tempdir() {
    return mkdtemp(join(tmpdir(), 'yucca'));
  }

  cp(src: string, dest: string, options?: Parameters<typeof cp>[2]) {
    return cp(src, dest, options);
  }

  mkdir(path: string, options?: Parameters<typeof mkdir>[1]) {
    return mkdir(path, options);
  }

  readdir(path: string) {
    return readdir(path);
  }

  stat(path: string) {
    return stat(path);
  }
}
