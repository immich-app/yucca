import {
  createRepository,
  createResticUrl,
  getAuth,
  getRepositories,
  RepositoryCreateRequestDto,
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

  async checkOnline(): Promise<void> {
    await getAuth(this.requestOptions);
  }

  async createRepository(dto: RepositoryCreateRequestDto) {
    return createRepository(dto, this.requestOptions);
  }

  async getRepositories() {
    return getRepositories(this.requestOptions);
  }

  async getResticEndpoint(id: string): Promise<string> {
    const { url } = await createResticUrl(id, this.requestOptions);
    return url;
  }
}
