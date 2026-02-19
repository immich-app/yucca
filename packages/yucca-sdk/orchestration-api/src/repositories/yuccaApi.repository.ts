import { Inject, Injectable, Optional } from '@nestjs/common';
import { YuccaApiEndpointUrlProvider } from '../providers';

import { createRepository, createResticUrl, defaults, getRepositories } from 'yucca-api-client';

@Injectable()
export class YuccaApiRepository {
  constructor(@Optional() @Inject(YuccaApiEndpointUrlProvider) endpoint: string) {
    defaults.baseUrl = endpoint ?? 'http://localhost:3000';
  }

  async createRepository(accessToken: string, _worm: boolean) {
    return createRepository({
      headers: {
        Cookie: `access-token=${accessToken}`,
      },
    });
  }

  async getRepositories(accessToken: string) {
    return getRepositories({
      headers: {
        Cookie: `access-token=${accessToken}`,
      },
    });
  }

  async createResticUrl(id: string, accessToken: string) {
    return createResticUrl(id, {
      headers: {
        Cookie: `access-token=${accessToken}`,
      },
    });
  }
}
