import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ModuleConfig } from '../moduleConfig';
import { LoggingRepository } from '../repositories/logging.repository';

export async function discardStateCacheDirectory(
  config: Pick<ModuleConfig, 'statePath' | 'cachePath'>,
  logger = LoggingRepository.create('State'),
): Promise<void> {
  const previousCachePath = resolve(config.statePath, 'restic-cache');
  if (!existsSync(previousCachePath) || (config.cachePath && resolve(config.cachePath) === previousCachePath)) {
    return;
  }

  logger.log(`Discarding the restic cache in ${previousCachePath}, it will be rebuilt by restic`);

  try {
    await rm(previousCachePath, { recursive: true, force: true });
  } catch (error) {
    logger.warn(`Could not discard the restic cache in ${previousCachePath}, restic will ignore it`, error);
  }
}
