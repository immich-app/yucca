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
import { BackendType, CookieName } from '../enum';
import { LoggingRepository } from '../repositories/logging.repository';
import { BackendConfiguration } from '../schema/tables/backend.table';
import { yuccaWellKnown } from '../wellKnown';
import { Backend } from './backend';

export class YuccaBackend extends Backend {
  private readonly logger = LoggingRepository.create(YuccaBackend.name);

  constructor(protected readonly configuration: BackendConfiguration & { type: BackendType.Yucca; url?: string }) {
    super(configuration);
  }

  private async getRequestOptions() {
    return {
      baseUrl: this.configuration.url ?? (await yuccaWellKnown.getBaseUrl()),
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
