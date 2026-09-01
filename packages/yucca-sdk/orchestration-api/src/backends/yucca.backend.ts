import {
  createRepository,
  createResticUrl,
  createTicket,
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
  TicketCreateRequestDto,
  TicketCreateResponseDto,
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

  async deleteRepository() {}

  async createTicket(dto: TicketCreateRequestDto): Promise<TicketCreateResponseDto> {
    return await createTicket(dto, await this.getRequestOptions());
  }

  async getResticEndpoint(id: string) {
    const { url } = await createResticUrl(id, await this.getRequestOptions());
    return url;
  }

  submitMetricBackupStart(id: string): void {
    void this.getRequestOptions()
      .then((requestOptions) => submitMetricBackupStart(id, requestOptions))
      .catch((error) => this.logger.error('Failed to submit backup start metric', error));
  }

  submitMetricBackupEnd(id: string, success: boolean, durationMs: number): void {
    void this.getRequestOptions()
      .then((requestOptions) => submitMetricBackupEnd(id, { durationMs, success }, requestOptions))
      .catch((error) => this.logger.error('Failed to submit backup end metric', error));
  }

  submitMetricRepositorySize(id: string, sizeBytes: number): void {
    void this.getRequestOptions()
      .then((requestOptions) => submitMetricRepositorySize(id, { sizeBytes }, requestOptions))
      .catch((error) => this.logger.error('Failed to submit repository size metric', error));
  }

  submitStructuredLog(summary: string, data: object) {
    void this.getRequestOptions()
      .then((requestOptions) => submitStructuredLog({ summary, data }, requestOptions))
      .catch((error) => this.logger.error('Failed to submit log', error));
  }
}
