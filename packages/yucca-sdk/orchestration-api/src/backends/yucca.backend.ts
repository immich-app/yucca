import { createRepository, getAuth, getRepositories } from 'yucca-api-client';
import { BackendType } from '../enum';
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
        cookie: `access-token=${this.configuration.accessToken}`,
      },
    };
  }

  async online(): Promise<boolean> {
    try {
      await getAuth(this.requestOptions);

      return true;
    } catch {
      return false;
    }
  }

  async createRepository(_worm: boolean) {
    return createRepository(this.requestOptions);
  }

  async getRepositories() {
    return getRepositories(this.requestOptions);
  }
}
