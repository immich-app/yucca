import { backup, init, stats } from '@futo-org/restic-wrapper';
import { Injectable } from '@nestjs/common';
import { Writable } from 'node:stream';

@Injectable()
export class ResticRepository {
  async init(repository: string, key: Buffer) {
    await init().repository(repository).password(key.toString('hex')).run();
  }

  async backup(repository: string, key: Buffer, paths: string[], logStream?: Writable) {
    await backup()
      .repository(repository)
      .password(key.toString('hex'))
      .addFile(...paths)
      .on('event', (event) => logStream?.write(JSON.stringify(event) + '\n'))
      .run();
  }

  async stats(repository: string, key: Buffer) {
    return await stats().repository(repository).password(key.toString('hex')).run();
  }
}