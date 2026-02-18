import { Inject, Injectable } from '@nestjs/common';

import { createRepository, defaults, getRepositories } from 'yucca-api-client';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';

@Injectable()
export class YuccaApiRepository {
  constructor(@Inject(ModuleConfigProvider) { yuccaProductionApi }: ModuleConfig) {
    defaults.baseUrl = yuccaProductionApi;
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
