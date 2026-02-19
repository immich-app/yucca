/* eslint-disable @typescript-eslint/require-await */

import { RepositoryCreateResponseDto, RepositoryListResponseDto } from '../dto/repository.dto';
import { Backend } from './backend';

export class S3Backend extends Backend {
  async online(): Promise<boolean> {
    return true;
  }

  createRepository(_worm: boolean): Promise<RepositoryCreateResponseDto> {
    throw new Error('Method not implemented.');
  }

  getRepositories(): Promise<RepositoryListResponseDto> {
    throw new Error('Method not implemented.');
  }
}
