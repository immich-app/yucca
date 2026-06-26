import {
  createRepository,
  createResticUrl,
  deleteRepository,
  getAuth,
  getRepositories,
  getRepository,
  RepositoryCreateRequestDto,
  RepositoryUpdateRequestDto,
  submitMetricBackupEnd,
  submitMetricBackupStart,
  submitMetricRepositorySize,
  submitStructuredLog,
  updateRepository,
} from '@futo-org/backups-api-client';
import { YUCCA_WELL_KNOWN } from '../const';
import { BackendType, CookieName } from '../enum';
import { LoggingRepository } from '../repositories/logging.repository';
import { BackendConfiguration } from '../schema/tables/backend.table';
import { Backend } from './backend';

type WellKnown = {
  backends: Record<string, { displayName: string; api: string }>;
  defaultBackend: string;
};

class YuccaWellKnown {
  private data?: WellKnown;

  async get() {
    this.data ??= await fetch(YUCCA_WELL_KNOWN, { signal: AbortSignal.timeout(8000) }).then((response) =>
      response.json(),
    );

    return this.data! as WellKnown;
  }

  async getBaseUrlById(id: string) {
    const { backends } = await this.get();
    return backends[id].api;
  }

  async getBaseUrl() {
    const { backends, defaultBackend } = await this.get();
    return backends[defaultBackend].api;
  }
}

export const yuccaWellKnown = new YuccaWellKnown();

export class YuccaBackend extends Backend {
  private readonly logger = LoggingRepository.create(YuccaBackend.name);

  constructor(protected readonly configuration: BackendConfiguration & { type: BackendType.Yucca; url?: string }) {
    super(configuration);
  }

  private async getRequestOptions() {
    return {
      baseUrl:
        this.configuration.url ??
        (this.configuration.uuid
          ? await yuccaWellKnown.getBaseUrlById(this.configuration.uuid)
          : await yuccaWellKnown.getBaseUrl()),
      headers: {
        cookie: `${CookieName.YuccaAccessToken}=${this.configuration.accessToken}`,
      },
    };
  }

  isBackupCapable(): boolean {
    return true;
  }

  isMetricsCapable(): boolean {
    return true;
  }

  async checkOnline() {
    await getAuth(await this.getRequestOptions());
  }

  async createRepository(dto: RepositoryCreateRequestDto) {
    return await createRepository(dto, await this.getRequestOptions());
  }

  async updateRepository(id: string, dto: RepositoryUpdateRequestDto) {
    return await updateRepository(id, dto, await this.getRequestOptions());
  }

  async getRepository(id: string) {
    return await getRepository(id, await this.getRequestOptions());
  }

  async getRepositories() {
    return await getRepositories(await this.getRequestOptions());
  }

  async deleteRepository(id: string) {
    return await deleteRepository(id, await this.getRequestOptions());
  }

  async getResticEndpoint(id: string) {
    const { url } = await createResticUrl(id, await this.getRequestOptions());
    return url;
  }

  async submitMetricBackupStart(id: string): Promise<void> {
    return await submitMetricBackupStart(id, await this.getRequestOptions());
  }

  async submitMetricBackupEnd(id: string, success: boolean, durationMs: number): Promise<void> {
    return await submitMetricBackupEnd(
      id,
      {
        durationMs,
        success,
      },
      await this.getRequestOptions(),
    );
  }

  async submitMetricRepositorySize(id: string, sizeBytes: number): Promise<void> {
    return await submitMetricRepositorySize(id, { sizeBytes }, await this.getRequestOptions());
  }

  submitStructuredLog(summary: string, data: object) {
    void this.getRequestOptions()
      .then((requestOptions) => submitStructuredLog({ summary, data }, requestOptions))
      .catch((error) => this.logger.error('Failed to submit log', error));
  }
}
