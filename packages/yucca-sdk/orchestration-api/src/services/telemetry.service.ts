import { Injectable } from '@nestjs/common';
import { Backend } from '../backends/backend';
import { REPOSITORY_DEFAULT_CLOUD_UUID } from '../const';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';

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
  ) {}

  private async submitStructuredLogImpl(summary: string, data: object, force: boolean) {
    if (!force) {
      const hasTelemetry = await this.config.hasTelemetry();
      if (!hasTelemetry) {
        return;
      }
    }

    void this.backend
      .getBackend(REPOSITORY_DEFAULT_CLOUD_UUID)
      .then(({ configuration }) => {
        const backend = Backend.from(configuration);
        backend.submitStructuredLog(summary, {
          ...serializeErrors(data),
          version,
        });
      })
      .catch(() => console.warn('No production backend configured, skipping structured log.'));
  }

  submitStructuredLog(summary: string, data: object, force = false) {
    void this.submitStructuredLogImpl(summary, data, force);
  }
}
