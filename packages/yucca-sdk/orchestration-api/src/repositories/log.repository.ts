import { Inject, Injectable } from '@nestjs/common';
import { createWriteStream, WriteStream } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';

@Injectable()
export class LogRepository {
  constructor(@Inject(ModuleConfigProvider) private readonly moduleConfig: ModuleConfig) {}

  async createLog(path: string, callback: (log: WriteStream) => Promise<void>) {
    const logPath = resolve(this.moduleConfig.statePath, 'logs', path);

    await mkdir(dirname(logPath), {
      recursive: true,
    });

    const log = createWriteStream(`${logPath}.incomplete.txt`);

    try {
      await callback(log);

      log.close();
      await rename(`${logPath}.incomplete.txt`, `${logPath}.txt`);
    } catch (error) {
      log.write(`${error}`);
      log.close();
      await rename(`${logPath}.incomplete.txt`, `${logPath}.failed.txt`);
    }
  }
}
