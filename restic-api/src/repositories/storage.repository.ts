import { Injectable } from '@nestjs/common';

@Injectable()
export class StorageRepository {
  fs: Record<string, Buffer> = {};

  write(path: string, data: Buffer) {
    this.fs[path] = data;
    console.debug(this.fs);
  }

  read(path: string) {
    return this.fs[path];
  }

  length(path: string) {
    return this.fs[path].length;
  }

  list(path: string, type: string) {
    const parent = `${path}/${type}/`;
    return Object.keys(this.fs)
      .filter((key) => key.startsWith(parent))
      .map((x) => x.slice(parent.length));
  }

  delete(path: string) {
    delete this.fs[path];
  }
}
