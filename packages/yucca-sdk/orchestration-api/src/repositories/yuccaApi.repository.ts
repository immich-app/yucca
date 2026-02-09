import { Injectable, OnModuleInit } from '@nestjs/common';

import { createRepository, defaults, getRepositories } from 'yucca-api-client';

@Injectable()
export class YuccaApiRepository implements OnModuleInit {
  onModuleInit() {
    // point to yucca
    defaults.baseUrl = `http://localhost:3000`;
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
