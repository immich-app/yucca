import { Injectable } from '@nestjs/common';
import { Backend } from '../backends/backend';
import { YUCCA_PRODUCTION_UUID } from '../const';
import { BackendRepository } from '../repositories/backend.repository';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';

function serializeErrors(data: object): object {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) =>
      value instanceof Error
        ? [key, { type: value.name, message: value.message, stack: value.stack, cause: value.cause }]
        : [key, value],
    ),
  );
}

@Injectable()
export class TelemetryService {
  constructor(
    private readonly backend: BackendRepository,
    private readonly moduleConfig: ModuleConfigRepository,
  ) {}

  submitStructuredLog(summary: string, data: object) {
    // TODO: check if structured log telemetry is on

    void this.backend
      .getBackend(YUCCA_PRODUCTION_UUID)
      .then(({ configuration }) => {
        const backend = Backend.from(configuration, this.moduleConfig.get());
        backend.submitStructuredLog(summary, serializeErrors(data));
      })
      .catch(() => console.warn('No production backend configured, skipping structured log.'));
  }
}
