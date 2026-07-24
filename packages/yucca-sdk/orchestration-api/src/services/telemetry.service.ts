import { Injectable } from '@nestjs/common';
import { Backend } from '../backends/backend';
import { REPOSITORY_DEFAULT_CLOUD_UUID } from '../const';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { LoggingRepository } from '../repositories/logging.repository';

function serializeErrors(data: object): object {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) =>
      value instanceof Error
        ? [key, { type: value.name, message: value.message, stack: value.stack, cause: value.cause }]
        : [key, value],
    ),
  );
}

import { version } from '../../package.json';

@Injectable()
export class TelemetryService {
  constructor(
    private readonly config: ConfigRepository,
    private readonly backend: BackendRepository,
    private readonly logger: LoggingRepository,
  ) {
    this.logger.setContext(TelemetryService.name);
  }

  private async submitStructuredLogImpl(summary: string, data: object, force: boolean) {
    this.logger.debug(summary, data);

    if (!force) {
      const hasTelemetry = await this.config.hasTelemetry();
      if (!hasTelemetry) {
        return;
      }
    }

    void this.backend
      .getBackend(REPOSITORY_DEFAULT_CLOUD_UUID)
      .then((result) => {
        if (!result) {
          throw new Error('No production backend configured');
        }

        const backend = Backend.from(result.configuration);
        backend.submitStructuredLog(summary, {
          ...serializeErrors(data),
          version,
        });
      })
      .catch(() => this.logger.warn('No production backend configured, skipping structured log.', summary));
  }

  submitStructuredLog(summary: string, data: object, force = false) {
    void this.submitStructuredLogImpl(summary, data, force);
  }
}
