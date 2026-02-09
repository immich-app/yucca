import { Injectable } from '@nestjs/common';

import { getRepositories } from 'yucca-api-client';

@Injectable()
export class YuccaApiRepository {
  async getRepositories() {
    return getRepositories();
  }
}
