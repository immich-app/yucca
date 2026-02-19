/* eslint-disable @typescript-eslint/require-await */

import { RepositoryCreateResponseDto, RepositoryListResponseDto } from '../dto/repository.dto';
import { BackendType } from '../enum';
import { BackendConfiguration } from '../schema/tables/backend.table';
import { Backend } from './backend';

export class S3Backend extends Backend {
  constructor(protected readonly configuration: BackendConfiguration & { type: BackendType.S3 }) {
    super(configuration);
  }

  async checkOnline(): Promise<void> {}

  createRepository(_worm: boolean): Promise<RepositoryCreateResponseDto> {
    throw new Error('Method not implemented.');
  }

  getRepositories(): Promise<RepositoryListResponseDto> {
    throw new Error('Method not implemented.');
  }

  async getResticEndpoint(id: string): Promise<string> {
    // TODO: requires additional auth parameters for restic
    return `s3:${this.configuration.endpoint}/${id}`;
  }
}
