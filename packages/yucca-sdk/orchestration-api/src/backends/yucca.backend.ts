import {
  createRepository,
  createResticUrl,
  getAuth,
  getRepositories,
  RepositoryCreateRequestDto,
  RepositoryUpdateRequestDto,
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

  async checkOnline() {
    await getAuth(this.requestOptions);
  }

  createRepository(dto: RepositoryCreateRequestDto) {
    return createRepository(dto, this.requestOptions);
  }

  updateRepository(id: string, dto: RepositoryUpdateRequestDto) {
    return updateRepository(id, dto, this.requestOptions);
  }

  getRepositories() {
    return getRepositories(this.requestOptions);
  }

  async getResticEndpoint(id: string) {
    const { url } = await createResticUrl(id, this.requestOptions);
    return url;
  }
}
