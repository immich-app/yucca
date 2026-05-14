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
  updateRepository,
} from 'yucca-api-client';
import { BackendType, CookieName } from '../enum';
import { BackendConfiguration } from '../schema/tables/backend.table';
import { Backend } from './backend';

export class YuccaBackend extends Backend {
  constructor(protected readonly configuration: BackendConfiguration & { type: BackendType.Yucca; url: string }) {
    super(configuration);
  }

  private get requestOptions() {
    return {
      baseUrl: this.configuration.url,
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
    await getAuth(this.requestOptions);
  }

  createRepository(dto: RepositoryCreateRequestDto) {
    return createRepository(dto, this.requestOptions);
  }

  updateRepository(id: string, dto: RepositoryUpdateRequestDto) {
    return updateRepository(id, dto, this.requestOptions);
  }

  getRepository(id: string) {
    return getRepository(id, this.requestOptions);
  }

  getRepositories() {
    return getRepositories(this.requestOptions);
  }

  deleteRepository(id: string) {
    return deleteRepository(id, this.requestOptions);
  }

  async getResticEndpoint(id: string) {
    const { url } = await createResticUrl(id, this.requestOptions);
    return url;
  }

  submitMetricBackupStart(id: string): Promise<void> {
    return submitMetricBackupStart(id, this.requestOptions);
  }

  submitMetricBackupEnd(id: string, success: boolean, durationMs: number): Promise<void> {
    return submitMetricBackupEnd(
      id,
      {
        durationMs,
        success,
      },
      this.requestOptions,
    );
  }

  submitMetricRepositorySize(id: string, sizeBytes: number): Promise<void> {
    return submitMetricRepositorySize(id, { sizeBytes }, this.requestOptions);
  }
}
