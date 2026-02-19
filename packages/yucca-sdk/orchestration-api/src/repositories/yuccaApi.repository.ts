import { Inject, Injectable, Optional } from '@nestjs/common';
import { YuccaApiEndpointUrlProvider } from 'src/providers';

import { createRepository, defaults, getRepositories } from 'yucca-api-client';

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
}
