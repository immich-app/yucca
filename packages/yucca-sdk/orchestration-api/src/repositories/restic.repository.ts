import { backup, init } from '@futo-org/restic-wrapper';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ResticRepository {
  async init(repository: string, key: Buffer) {
    await init().repository(repository).password(key.toString('hex')).run();
  }

  async backup(repository: string, key: Buffer) {
    await backup().repository(repository).password(key.toString('hex')).addFile('/home/insert/Nextcloud/pls/').run();
  }
}
