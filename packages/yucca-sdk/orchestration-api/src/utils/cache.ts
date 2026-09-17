import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ModuleConfig } from '../moduleConfig';
import { LoggingRepository } from '../repositories/logging.repository';

export function discardStateCacheDirectory(
  config: Pick<ModuleConfig, 'statePath' | 'cachePath'>,
  logger = LoggingRepository.create('State'),
): void {
  const previousCachePath = resolve(config.statePath, 'restic-cache');
  if (!existsSync(previousCachePath) || (config.cachePath && resolve(config.cachePath) === previousCachePath)) {
    return;
  }

  logger.log(`Discarding the restic cache in ${previousCachePath}, it will be rebuilt by restic`);
  rmSync(previousCachePath, { recursive: true, force: true });
}
